'use strict';

/* dummy validator class */
class Validator {
	constructor(typesSchemas) { }

	createAjvInstance(typesSchemas) { }

	addDefaultTypes() { }
	addTypes(schemas) { }

	typeToSchemaName(name) {
		return name.replace('|', '_');
	}

	addType(name,schema) { }

	validateType(type) { }
	validateTypeGoingInside(type) { }
	validateProtocol(protocol) { }
}

module.exports = Validator;
