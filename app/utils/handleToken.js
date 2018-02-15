const jwt = require('jsonwebtoken');
const config = require('../../config');

const handleToken = (token) => {
    const decoded = jwt.verify(token, config.secret);
    return decoded;
}

module.exports = handleToken;
