const { handleRequest } = require('../server/index');

module.exports = async (req, res) => {
  return handleRequest(req, res);
};
