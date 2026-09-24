import { answerSearchRequest, type SearchRequest, type SearchResponse } from './search-protocol';

/**
 * The worker's global scope, typed by hand: the project compiles against the
 * DOM library, where `self.postMessage` is the window's version.
 */
const scope = self as unknown as {
  onmessage: ((event: MessageEvent<SearchRequest>) => void) | null;
  postMessage(response: SearchResponse): void;
};

// Searches run one after another; the page stops this worker to cancel one.
scope.onmessage = (event) => {
  scope.postMessage(answerSearchRequest(event.data));
};
