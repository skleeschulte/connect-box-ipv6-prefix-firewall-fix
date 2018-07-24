const axios = require('axios');
const querystring = require('querystring');
const tough = require('tough-cookie');
const xml2js = require('xml2js');

const INBOUND = 0;
const OUTBOUND = 1;

module.exports = class ConnectBoxClient {
    constructor(host) {
        this.baseUrl = 'http://' + host;
        this.cookieJar = new tough.CookieJar();
        this.client = axios.create({ baseURL: this.baseUrl });

        this.client.interceptors.request.use(req => {
            req.headers.common.Cookie = this.cookieJar.getCookieStringSync(this.baseUrl);
            return req;
        });

        this.client.interceptors.response.use(res => {
            let cookies;
            if (Array.isArray(res.headers['set-cookie'])) {
                cookies = res.headers['set-cookie'].map(tough.Cookie.parse);
            } else {
                cookies = [tough.Cookie.parse(res.headers['set-cookie'])];
            }
            cookies.forEach(cookie => {
                // If the request was redirected, the redirect URL can be found in res.request.res.responseUrl
                this.cookieJar.setCookieSync(cookie, res.request.res.responseUrl || res.config.url);
                if (cookie.key === 'sessionToken') {
                    this.currSessionToken = cookie.value;
                    this.giveNextSessionToken();
                }
            });
            return res;
        });

        this.currSessionToken = null;
        this.pendingSessionTokenPromiseResolvers = [];

        this.ipv6FirewallRulesCache = [
            null, // inbound
            null  // outbound
        ];

        this.firewallTimeRulesCache = null;
    }

    getSessionToken() {
        if (this.currSessionToken) {
            const currSessionToken = this.currSessionToken;
            this.currSessionToken = null;
            return Promise.resolve(currSessionToken);
        } else {
            let resolve = null;
            let sessionTokenPromise = new Promise(r => resolve = r);
            this.pendingSessionTokenPromiseResolvers.push(resolve);
            return sessionTokenPromise;
        }
    }

    giveNextSessionToken() {
        if (this.currSessionToken && this.pendingSessionTokenPromiseResolvers.length > 0) {
            const currSessionToken = this.currSessionToken;
            this.currSessionToken = null;
            this.pendingSessionTokenPromiseResolvers.shift()(currSessionToken);
        }
    }

    call(endpoint, fun, data) {
        return this.getSessionToken()
            .then(sessionToken => {
                // careful: order does matter here:
                data = {
                    token: sessionToken,
                    fun,
                    ...data
                };

                return this.client.post(endpoint, querystring.stringify(data), { maxRedirects: 0 });
            });
    }

    callGetter(fun, data) {
        return this.call('/xml/getter.xml', fun, data);
    }

    callSetter(fun, data) {
        return this.call('/xml/setter.xml', fun, data);
    }

    login(password) {
        // first make request to / to get first session token, then login
        return this.client.get('/')
            .then(() => this.callSetter(15, { Username: 'NULL', Password: password }));
    }

    logout() {
        this.cookieJar = new tough.CookieJar();
        return this.callSetter(16);
    }

    getIpv6FirewallRules(direction) {
        if (this.ipv6FirewallRulesCache[direction]) return this.ipv6FirewallRulesCache[direction];

        return this.callGetter(111, { rule: direction })
            .then(res => new Promise((resolve, reject) => {
                xml2js.parseString(res.data, (err, obj) => {
                    if (err) return reject(err);
                    obj.IPv6filtering.instance.forEach(rule => Object.keys(rule).forEach(field => rule[field] = rule[field][0]));
                    this.ipv6FirewallRulesCache[direction] = obj.IPv6filtering.instance;
                    resolve(obj.IPv6filtering.instance);
                });
            }));
    }

    getInboundIpv6FirewallRules() {
        return this.getIpv6FirewallRules(INBOUND);
    }

    getOutboundIpv6FirewallRules() {
        return this.getIpv6FirewallRules(OUTBOUND);
    }

    removeIpv6FirewallRule(direction, ids) {
        if (!Array.isArray(ids)) ids = [ids];

        return Promise.all([
            this.getIpv6FirewallRules(direction),
            this.getFirewallTimeRules()
        ]).then(values => {
            const [ipv6FirewallRules, firewallTimeRules] = values;

            let idd = [];
            let enabled = [];
            let del = [];

            ipv6FirewallRules.forEach(rule => {
                idd.push(rule.idd);
                enabled.push(rule.enabled);
                del.push(ids.includes(rule.idd) ? '1' : '0');
            });

            idd = idd.join('*');
            enabled = enabled.join('*');
            del = del.join('*');

            return this.callSetter(112, {
                act: 1, // Aenderungen uebernehmen
                dir: direction, // inbound or outbound
                enabled,
                allow_traffic: '',
                protocol: '',
                src_addr: '',
                src_prefix: '',
                dst_addr: '',
                dst_prefix: '',
                ssport: '',
                seport: '',
                dsport: '',
                deport: '',
                del,
                idd,
                slpRange: '',
                dslpRange: '',
                PortRange: '',
                ...this.convertFirewallTimeRulesForSetter(firewallTimeRules)
            }).then(res => {
                this.ipv6FirewallRulesCache[direction] = null;
                return res;
            });
        });
    }

    removeInboundIpv6FirewallRule(id) {
        return this.removeIpv6FirewallRule(INBOUND, id);
    }

    removeOutboundIpv6FirewallRule(id) {
        return this.removeIpv6FirewallRule(OUTBOUND, id);
    }

    addIpv6FirewallRule(direction, config) {
        return this.callSetter(112, {
            act: 2, // Neue Regel erstellen
            dir: direction, // inbound or outbound
            enabled: '1',
            allow_traffic: '0', // 0 = allow, 1 = deny
            protocol: '0',
            src_addr: config.srcAddr,
            src_prefix: config.srcPrefixLength,
            dst_addr: config.dstAddr,
            dst_prefix: config.dstPrefixLength,
            ssport: '1',
            seport: '65535',
            dsport: '1',
            deport: '65535',
            del: '',
            idd: '',
            slpRange: config.slpRange,
            dslpRange: config.dslpRange,
            PortRange: '0',
            TRule: '0'
        }).then(res => {
            this.ipv6FirewallRulesCache[direction] = null;
            return res;
        });
    }

    addInboundIpv6FirewallRuleToAllowPrefix(prefix, prefixLength) {
        const config = {
            srcAddr: '::',
            srcPrefixLength: '128',
            dstAddr: '' + prefix,
            dstPrefixLength: '' + prefixLength,
            slpRange: '0',
            dslpRange: '2'
        };
        return this.addIpv6FirewallRule(INBOUND, config);
    }

    addOutboundIpv6FirewallRuleToAllowPrefix(prefix, prefixLength) {
        const config = {
            srcAddr: '' + prefix,
            srcPrefixLength: '' + prefixLength,
            dstAddr: '::',
            dstPrefixLength: '128',
            slpRange: '2',
            dslpRange: '0'
        };
        return this.addIpv6FirewallRule(OUTBOUND, config);
    }

    getFirewallTimeRules() {
        if (this.firewallTimeRulesCache) return this.firewallTimeRulesCache;

        return this.callGetter(109)
            .then(res => new Promise((resolve, reject) => {
                xml2js.parseString(res.data, (err, obj) => {
                    if (err) return reject(err);
                    this.firewallTimeRulesCache = obj.IPfiltering;
                    resolve(obj.IPfiltering);
                });
            }));
    }

    convertFirewallTimeRulesForSetter(firewallTimeRules) {
        const mode = firewallTimeRules.time_mode[0];
        let rule = '';

        if (mode === '0') {
            // Immer eingeschaltet
            rule = '0';
        } else if (mode === '1') {
            // Jeden Tag zur gleichen Zeit
            const rules = [];
            firewallTimeRules.GeneralTime[0].time.forEach(time => {
                const interval = time.split('-');
                const intervalStart = interval[0].split(':').map(v => parseInt(v));
                const intervalEnd = interval[1].split(':').map(v => parseInt(v));
                rules.push(intervalStart[0] * 60 + intervalStart[1]);
                rules.push(intervalEnd[0] * 60 + intervalEnd[1]);
            });
            rule = rules.join(',');
        } else if (mode === '2') {
            // Zu verschiedenen Zeiten an unterschiedlichen Tagen der Woche
            const rules = [0, 0, 0, 0, 0, 0, 0]; // mon - sun
            firewallTimeRules.DailyTime[0].time_instance.forEach(time => {
                const day = time.daily - 1;
                const interval = time.time[0].split('-');
                const intervalStart = parseInt(interval[0]);
                const intervalEnd = parseInt(interval[1]);
                for (let i = intervalStart; i <= intervalEnd; i++) {
                    rules[day] |= 1 << (23 - i);
                }
            });
            rule = rules.join(',');
        } else {
            throw new Error('Invalid time mode.');
        }

        return {
            TMode: mode,
            TRule: rule
        };
    }
};
