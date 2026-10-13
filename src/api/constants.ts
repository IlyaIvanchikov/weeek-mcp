// WEEEK stores an attachment either itself ("weeek") or in a third-party drive. The set is
// closed, so it is a closed type: a new service must fail the type check wherever it is read.
export const attachmentServices = ["weeek", "google_drive", "dropbox", "one_drive", "box"] as const;
