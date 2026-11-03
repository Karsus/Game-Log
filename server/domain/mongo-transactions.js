function isStandaloneTransactionError(error) {
  return error?.name === 'MongoServerError' && error.code === 20 && error.message === 'Transaction numbers are only allowed on a replica set member or mongos'
}

module.exports = { isStandaloneTransactionError }
