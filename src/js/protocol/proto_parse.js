'use strict';

const types = {
	u8: (offset, isSetter) => [`.${isSetter ? 'get' : 'set'}Uint8(${offset});`, 1],

};

function makeParser(ocList) {

}

function makeBuilders(ocList) {

}