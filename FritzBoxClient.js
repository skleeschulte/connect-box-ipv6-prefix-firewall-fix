const tr064lib = require("tr-064");

module.exports = class FritzBoxClient {
    constructor(host) {
        this.tr064 = new tr064lib.TR064();
        this.host = host;
    }

    getIPv6Prefix() {
        return new Promise((resolve, reject) => {
            this.tr064.initIGDDevice(this.host, 49000, (err, device) => {
                if (err) {
                    reject(err);
                } else {
                    const service = device.services["urn:schemas-upnp-org:service:WANIPConnection:1"];
                    service.actions['X_AVM_DE_GetIPv6Prefix']((err, result) => {
                        if (err) {
                            reject(err);
                        } else {
                            resolve({
                                prefix: result.NewIPv6Prefix,
                                prefixLength: result.NewPrefixLength
                            })
                        }
                    });
                }
            });
        });
    }
};
