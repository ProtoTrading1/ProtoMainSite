import { createApolloActivityHandler } from './apollo-activity.js';

// A fixed server route prevents the browser from choosing the reporting source.
export default createApolloActivityHandler({ source: 'main' });
