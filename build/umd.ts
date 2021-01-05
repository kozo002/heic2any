export const umdString = `
(function (global, factory) {
    if(typeof exports === 'object' && typeof module !== 'undefined') {
        var lib = factory();
        module.exports = lib;
        module.exports.default = lib;
    }
	else if(typeof define === 'function' && define.amd) {
        define(factory);
    }
    else {
        (global = global || self, global.heic2any = factory())
    }
}(this, function () { 'use strict';
`;
export const returnString = `
return heic2any;
}));
`;
