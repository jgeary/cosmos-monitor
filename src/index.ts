import express from 'express';
import {CosmosMonitor} from './CosmosMonitor';

const app = express();
const port = process.env.PORT || 8080;

const cm = new CosmosMonitor();

app.get('/monitor', async (req, res, next) => {
  try {
    const newBlockHeight = await cm.getBlocks();
    await cm.processBlocks();
    cm.lastBlockHeight = newBlockHeight;

    await cm.checkConsensusStateDump();
    await cm.checkUnconfirmedTxs();
    await cm.checkStatus();

    cm.blocks = [];
    res.send('success');
  } catch (e) {
    await cm.sendToSlack(
      `Debug message: the monitor had an error around block ${cm.lastBlockHeight}.`
    );
    next(e);
  }
});

app.listen(port, () => {
  console.log(`Listening on port ${port}`);
});
