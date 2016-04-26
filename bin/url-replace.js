#!/usr/bin/env node

var proxy = require("../proxy");

var replaceName = process.argv[2];
if (replaceName == "-h") {
	console.log("Usage: node proxy.js [replaceName]");
	process.exit(0);
}
proxy.startProxy(replaceName);
