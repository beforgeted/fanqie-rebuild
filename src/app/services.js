// The composition root: features use services; providers cannot access storage or shelf writes.
const appServices=Object.freeze({
  bookDetails:Object.freeze({load:fetchBookDetails}),
  analysis:createBookAnalysisService({loadBook:fetchBookDetails})
});
