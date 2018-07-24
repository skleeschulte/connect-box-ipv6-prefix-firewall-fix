const FritzBoxClient = require('./FritzBoxClient');
const ConnectBoxClient = require('./ConnectBoxClient');

const DEBUG = false;

module.exports = async function main(fritzBoxHost, connectBoxHost, connectBoxPassword) {
    let currPrefix;
    let currPrefixLength;

    const fritzBoxClient = new FritzBoxClient(fritzBoxHost);
    try {
        console.log('Getting current IPv6 prefix from Fritz!Box...');
        const currPrefixData = await fritzBoxClient.getIPv6Prefix();
        currPrefix = currPrefixData.prefix;
        currPrefixLength = currPrefixData.prefixLength;
        console.log(`Current IPv6 prefix is ${currPrefix}/${currPrefixLength}`);
    } catch(err) {
        console.log('Failed to get current IPv6 prefix from Fritz!Box.');
        if (err instanceof Error) console.log(err.toString());
        if (DEBUG) console.log(err);
        return;
    }

    const connectBoxClient = new ConnectBoxClient(connectBoxHost);
    try {
        console.log('Looging in to ConnectBox...');
        const loginResult = await connectBoxClient.login(connectBoxPassword);
        if (loginResult.status === 200 && loginResult.data.includes('successful')) {
            console.log('Login successful: ' + loginResult.data.substring(0, 50));
        } else {
            console.log('Login failed: ' + loginResult.data.substring(0, 50));
            if (DEBUG) console.log(loginResult);
            return;
        }

        try {
            const inboundRules = await connectBoxClient.getInboundIpv6FirewallRules();
            console.log(`Found ${inboundRules.length} inbound IPv6 firewall rules:`);
            inboundRules.forEach(rule => { console.log(JSON.stringify(rule)) });

            const outboundRules = await connectBoxClient.getOutboundIpv6FirewallRules();
            console.log(`Found ${outboundRules.length} outbound IPv6 firewall rules:`);
            outboundRules.forEach(rule => { console.log(JSON.stringify(rule)) });

            // fix inbound rules
            const oldInboundRules = inboundRules.filter(rule => rule.dst_addr !== currPrefix && rule.dst_prefix === currPrefixLength);
            for (let i = 0; i < oldInboundRules.length; i++) {
                console.log('Deleting old inbound rule for prefix:');
                console.log(JSON.stringify(oldInboundRules[i]));
                await connectBoxClient.removeInboundIpv6FirewallRule(oldInboundRules[i].idd);
                console.log('Done.');
            }
            if (!inboundRules.find(rule => rule.dst_addr === currPrefix && rule.dst_prefix === currPrefixLength)) {
                console.log('Adding inbound rule for current prefix...');
                await connectBoxClient.addInboundIpv6FirewallRuleToAllowPrefix(currPrefix, currPrefixLength);
                console.log('Done.');
            } else {
                console.log('Found inbound rule for current prefix - no update necessary.');
            }

            // fix outbound rules
            const oldOutboundRules = outboundRules.filter(rule => rule.src_addr !== currPrefix && rule.src_prefix === currPrefixLength);
            for (let i = 0; i < oldOutboundRules.length; i++) {
                console.log('Deleting old outbound rule for prefix:');
                console.log(JSON.stringify(oldOutboundRules[i]));
                await connectBoxClient.removeOutboundIpv6FirewallRule(oldOutboundRules[i].idd);
                console.log('Done.');
            }
            if (!outboundRules.find(rule => rule.src_addr === currPrefix && rule.src_prefix === currPrefixLength)) {
                console.log('Adding outbound rule for current prefix...');
                await connectBoxClient.addOutboundIpv6FirewallRuleToAllowPrefix(currPrefix, currPrefixLength);
                console.log('Done.');
            } else {
                console.log('Found outbound rule for current prefix - no update necessary.');
            }
        } catch (err) {
            console.log('There was an error while trying to communicate with the ConnectBox.');
            if (err instanceof Error) console.log(err.toString());
            if (DEBUG) console.log(err);
        }

        console.log('Logging out from ConnectBox...');
        const logoutResult = await connectBoxClient.logout();
        if (logoutResult.status === 200 && logoutResult.data === '') {
            console.log('Logout successful.');
        } else {
            console.log('Logout failed: ' + logoutResult.data.substring(0, 50))
        }
    } catch (err) {
        console.log('There was an error while trying to communicate with the ConnectBox.');
        if (err instanceof Error) console.log(err.toString());
        if (DEBUG) console.log(err);
    }
};
