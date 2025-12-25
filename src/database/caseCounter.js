const Counter = require('./models/Counter');

async function getNextCaseNumber() {
  // Atomically increment the counter named 'caseNumber'
  const doc = await Counter.findOneAndUpdate(
    { _id: 'caseNumber' },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  ).exec();
  return doc.seq;
}

module.exports = { getNextCaseNumber };
