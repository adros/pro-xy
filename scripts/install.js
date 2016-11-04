#!/usr/bin/env node

var fs = require("fs");
var CONSTS = require("../lib/consts");


if (!fs.existsSync(CONSTS.CONFIG_LOCATION)) {
	var conf = {
		port: CONSTS.DEFAULT_PORT,
		logLevel: "INFO"
	};
	fs.writeFileSync(CONSTS.CONFIG_LOCATION, JSON.stringify(conf, null, "\t"));
	console.log(`Default config file '${CONSTS.CONFIG_LOCATION}' created`);
} else {
	console.log(`Config file '${CONSTS.CONFIG_LOCATION}' already exists`);
}
