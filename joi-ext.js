'use strict';

const JoiStringConvertible = function(joi) {
	return {
		base: joi.string(),
		name: 'stringConvertible',
		coerce(value, state, options) {
			function isNumeric(n) {
				return !isNaN(parseFloat(n)) && isFinite(n);
			}
			if (isNumeric(value)) {
				return value.toString();
			}
			return value;
		},
	};
};

const Joi = require('joi').extend([ JoiStringConvertible ]);

const settings = {
	passwordMinLength: 6,
	passwordMaxLength: 255,
	passwordRegex: /^(?=.*\d)(?=.*[A-Z])(?=.*[a-z])(?=.*[!@#$%^&*()\-_=+\\|[\]{};:/?.><]).*$/,
	passwordErrorMessage: 'Please enter stronger password. Use at least 1 uppercase, 1 lowercase, 1 numeric and 1 special character.',
};

// Set a default error handler.
Joi.originalValidateFn = Joi.validate;
Joi.validate = (data, schema, options) => {
	let baseOptions = {
		allowUnknown: true,
		stripUnknown: true,
	};

	options = Object.assign(baseOptions, options);
	let {
		error,
		value,
	} = Joi.originalValidateFn(data, schema, options);

	if (error != null) {
		throw error;
	}

	return value;
};

Joi.password = () => {
	return Joi.string().min(settings.passwordMinLength).max(settings.passwordMaxLength)
		.regex(settings.passwordRegex, settings.passwordErrorMessage);
};

/**
 * Exported functions.
 * @type {Object}
 */
module.exports = Joi;
