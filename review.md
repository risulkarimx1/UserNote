# PDF Export Implementation Plan Review

## Findings
- **Browser download unusable**: The plan has the backend return `filePath`/`fileName` values (absolute filesystem paths) and the frontend simply renders that path in the success modal. Browsers cannot read files from arbitrary filesystem paths on the server, so the user would have no way to get the PDF. The endpoint should instead stream the PDF (or return a signed download URL) so the UI can trigger a real download.
- **File naming collision**: The suggested filename pattern `{notebook-name}_{YYYY-MM-DD}.pdf` is not unique. Multiple exports in the same day would overwrite each other, risking data loss. Include a time component or unique identifier in the filename.

## Recommendations
1. Change the export endpoint to return the PDF as a binary response or supply a dedicated download URL that the client can hit.
2. Update filename generation to include a timestamp (e.g., `{notebook-name}_{YYYY-MM-DD_HH-mm-ss}.pdf`) or a UUID to prevent collisions.
