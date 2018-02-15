const jwt = require('jsonwebtoken');
const config = require('../../config');

const isUserAuth = (token, command) => {
    const decoded = jwt.verify(token, config.secret);
    if (decoded.command !== command) {
        return false;
    }
    return true;
}

module.exports = isUserAuth;
