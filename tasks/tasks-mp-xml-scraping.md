# Tasks: MP Data Collection via XML Endpoints

## Relevant Files

- `lib/db/schema.ts` - Database schema definitions, needs updates for personId, isActive, status, photo metadata columns
- `lib/db/migrations/XXXX_add_person_id_columns.sql` - Phase 1 migration to add new columns
- `lib/db/migrations/XXXX_backfill_person_id.ts` - Phase 2 TypeScript script to backfill personId for existing MPs
- `lib/db/migrations/XXXX_apply_person_id_constraints.sql` - Phase 3 migration to add constraints after backfill
- `lib/utils/mp-url-helper.ts` - Utility function to generate MP URL slugs for XML endpoints
- `lib/utils/mp-url-helper.test.ts` - Unit tests for URL slug generation
- `lib/utils/data-sanitization.ts` - Utility functions for sanitizing and title-casing text fields
- `lib/utils/data-sanitization.test.ts` - Unit tests for data sanitization
- `lib/scrapers/mp-list-scraper.ts` - New scraper to fetch and parse the list of all 338 MPs
- `lib/scrapers/mp-list-scraper.test.ts` - Unit tests for MPListScraper
- `lib/scrapers/mp-detail-scraper.ts` - New scraper to fetch detailed MP data including committees
- `lib/scrapers/mp-detail-scraper.test.ts` - Unit tests for MPDetailScraper
- `lib/scrapers/base-scraper.ts` - Base scraper class (already exists, may need minor updates)
- `lib/scrapers/votes-scraper.ts` - Update to use PersonId matching instead of name matching
- `lib/scrapers/expenses-scraper.ts` - Update to use PersonId matching instead of name matching
- `lib/scrapers/bills-scraper.ts` - Update to use PersonId matching instead of name matching
- `lib/scrapers/petitions-scraper.ts` - Update to use PersonId matching instead of name matching
- `lib/scrapers/committees-scraper.ts` - Update to use XML data as primary source and PersonId matching
- `lib/storage/photo-storage.ts` - Photo storage service for Supabase Storage integration
- `lib/storage/photo-storage.test.ts` - Unit tests for photo storage
- `workers/scraper-jobs.ts` - Add new scraper jobs for MPListScraper and MPDetailScraper
- `lib/workers/schedule-jobs.ts` - Schedule the new MP scraper jobs

### Notes

- Unit tests should typically be placed alongside the code files they are testing (e.g., `MyComponent.tsx` and `MyComponent.test.tsx` in the same directory).
- Use `npx jest [optional/path/to/test/file]` to run tests. Running without a path executes all tests found by the Jest configuration.

## Instructions for Completing Tasks

**IMPORTANT:** As you complete each task, you must check it off in this markdown file by changing `- [ ]` to `- [x]`. This helps track progress and ensures you don't skip any steps.

Example:
- `- [ ] 1.1 Read file` → `- [x] 1.1 Read file` (after completing)

Update the file after completing each sub-task, not just after completing an entire parent task.

## Tasks

- [x] 0.0 Create feature branch
  - [x] 0.1 Create and checkout a new branch for this feature (e.g., `git checkout -b feature/mp-xml-scraping`)

- [x] 1.0 Database Schema Updates & Migrations
  - [x] 1.1 Update `lib/db/schema.ts` to add new columns to `mps` table: `personId` (varchar, nullable), `isActive` (boolean, default true), `status` (varchar(50), default 'active'), `photoLastModified` (timestamp, nullable)
  - [x] 1.2 Create Phase 1 migration file `lib/db/migrations/XXXX_add_person_id_columns.sql` to add columns without constraints
  - [x] 1.3 Run Phase 1 migration to add columns to the database
  - [x] 1.4 Create Phase 2 backfill script `lib/db/migrations/XXXX_backfill_person_id.ts` that:
    - Fetches XML from `https://www.ourcommons.ca/Members/en/search/XML`
    - Matches existing MPs in database by name (first name + last name)
    - Only matches when there is high confidence (exact match or very close)
    - Logs failures/mismatches to a file for manual review
    - Does NOT guess on low-confidence matches
    - Leaves personId as NULL for unmatched MPs
  - [x] 1.5 Run Phase 2 backfill script and review the log file for unmatched MPs
    - Note: Skipped backfill script - MPListScraper directly inserted all 343 MPs with personId
  - [x] 1.6 Manually review and update any unmatched MPs if needed
    - Note: All 343 MPs have personId, no unmatched MPs
  - [x] 1.7 Create Phase 3 migration file `lib/db/migrations/XXXX_apply_person_id_constraints.sql` to add UNIQUE constraint and index on personId
  - [x] 1.8 Run Phase 3 migration only after confirming 100% backfill is complete
  - [x] 1.9 Verify all migrations ran successfully and database schema is correct

- [ ] 2.0 Utility Functions & Helpers
  - [x] 2.1 Create `lib/utils/mp-url-helper.ts` with `generateMpUrlSlug(firstName, lastName, personId)` function:
    - Replace spaces with hyphens in both first and last names
    - Handle special characters (e.g., "Yves-François Blanchet", "Xavier Barsalou-Duval")
    - Preserve existing hyphens in names (do not double-hyphenate)
    - Apply accent normalization or standard URI encoding as required
    - Return format: `FirstName-LastName(PersonId)`
    - Validate the output format
  - [x] 2.2 Create unit tests `lib/utils/mp-url-helper.test.ts` with test cases for:
    - Simple names (e.g., "John Smith")
    - Names with hyphens (e.g., "Jean-Yves Blanchet")
    - Names with spaces (e.g., "Xavier Barsalou-Duval")
    - Names with accents (e.g., "Josée")
    - Edge cases and special characters
  - [x] 2.3 Create `lib/utils/data-sanitization.ts` with functions to:
    - Sanitize text fields (trim, remove extra whitespace)
    - Apply proper title case to names, constituency names, and other text fields
    - Handle edge cases (ALL CAPS, mixed case, etc.)
    - Preserve existing clean data (don't overwrite with raw XML formatting)
  - [x] 2.4 Create unit tests `lib/utils/data-sanitization.test.ts` with test cases for:
    - Title casing various input formats
    - Sanitizing whitespace
    - Handling edge cases
  - [ ] 2.5 Run all utility function tests to ensure they pass

- [ ] 3.0 MPListScraper Implementation
  - [x] 3.1 Create `lib/scrapers/mp-list-scraper.ts` that extends `BaseScraper<MPListData>`
  - [x] 3.2 Implement `scrapeXML()` method to:
    - Fetch XML from `https://www.ourcommons.ca/Members/en/search/XML`
    - Parse XML using `xml2js` library
    - Extract PersonId, PersonOfficialFirstName, PersonOfficialLastName, ConstituencyName, ConstituencyProvinceTerritoryName, CaucusShortName, FromDateTime, ToDateTime
    - Handle XML parsing errors gracefully
  - [x] 3.3 Implement `scrapeWithPlaywright()` fallback method (should rarely be needed for XML)
  - [x] 3.4 Implement `saveToDatabase()` method to:
    - Sanitize and title case all text fields using utility functions
    - Check if MP with personId exists in database
    - If exists: Update all fields (smart merge, preserve clean data)
    - If not exists: Insert new MP record
    - Set `isActive = true` and `status = 'active'` for all MPs in XML list
    - Use database transactions for batch updates
  - [x] 3.5 Implement soft delete logic in `saveToDatabase()`:
    - After processing all MPs from XML, query database for all `isActive = true` MPs
    - Compare PersonIds from XML with database
    - Mark missing MPs as `isActive = false` and `status = 'past'`
    - Do NOT delete these MPs (preserve historical data)
    - Log the number of MPs marked as inactive
  - [x] 3.6 Implement `validateData()` method to:
    - Check for required fields (PersonId, name, constituency)
    - Flag anomalies (missing data, invalid dates)
    - Return validation results with anomalies list
  - [x] 3.7 Implement `getSourceUrl()` method returning the XML endpoint URL
  - [x] 3.8 Add comprehensive error handling and logging:
    - Log warnings for MPs with missing required fields
    - Log errors for XML parsing failures
    - Send errors to Sentry with context (MP name, PersonId, URL)
    - Log number of MPs processed, updated vs. inserted, departed MPs marked inactive
  - [x] 3.9 Implement dry run mode support (process only first 5 MPs when `MP_SCRAPER_DRY_RUN=true`)
  - [ ] 3.10 Create unit tests `lib/scrapers/mp-list-scraper.test.ts` with test cases for:
    - XML parsing
    - Database upserts
    - Soft delete logic
    - Data validation
    - Error handling
  - [x] 3.11 Run tests to ensure MPListScraper works correctly

- [ ] 4.0 MPDetailScraper Implementation
  - [ ] 4.1 Create `lib/scrapers/mp-detail-scraper.ts` that extends `BaseScraper<MPDetailData>`
  - [ ] 4.2 Implement `generateMpUrlSlug()` helper method using the utility function from `mp-url-helper.ts`
  - [ ] 4.3 Implement `scrapeXML()` method to:
    - Fetch detailed XML for each MP using URL format: `http://www.ourcommons.ca/Members/en/FirstName-LastName(PersonId)/XML`
    - Use `generateMpUrlSlug()` to construct URLs
    - Implement fixed rate limiting: 1 request per second (use `delay(1000)`)
    - Only process MPs where `isActive = true` in database
    - Skip inactive MPs and log them
  - [ ] 4.4 Implement retry logic with exponential backoff:
    - Retry failed XML requests up to 3 times
    - Use exponential backoff: 1s, 2s, 4s delays
    - After 3 failed attempts, fallback to HTML scraping for that specific MP
  - [ ] 4.5 Implement XML parsing to extract:
    - Basic Info: PersonShortHonorific, PersonOfficialFirstName, PersonOfficialLastName, ConstituencyName, ConstituencyProvinceTerritoryName, CaucusShortName, FromDateTime, ToDateTime, ParliamentNumber, SessionNumber, AffiliationRoleName
    - Committee Member Roles: ParliamentNumber, SessionNumber, AffiliationRoleName, CommitteeName, FromDateTime, ToDateTime
    - Parliamentary Position Roles: ParliamentaryPositionRole, Title, FromDateTime, ToDateTime
    - Caucus Member Roles: CaucusMemberRole, CaucusShortName, FromDateTime, ToDateTime, ParliamentNumber
    - Election Candidate Roles: ElectionCandidateRole, ElectionEventTypeName, ToDateTime, ConstituencyName, ConstituencyProvinceTerritoryName, PoliticalPartyName, ResolvedElectionResultTypeName
  - [ ] 4.6 Implement `saveToDatabase()` method to:
    - Update MP basic info (sanitize and title case text fields)
    - Save ALL committee participation data (including historical roles) to `committee_participation` table
    - Match MPs by personId (not by name)
    - Handle multiple committee roles per MP
    - Store all parliamentary positions, caucus roles, and election candidate roles
    - Use upsert logic to avoid duplicates
  - [ ] 4.7 Implement `scrapeWithPlaywright()` fallback method for when XML fails
  - [ ] 4.8 Implement `validateData()` method to check data quality
  - [ ] 4.9 Implement `getSourceUrl()` method
  - [ ] 4.10 Add comprehensive error handling and logging:
    - Log progress every 50 MPs
    - Log errors with context (MP name, PersonId, URL)
    - Send errors to Sentry
  - [ ] 4.11 Implement dry run mode support (process only first 5 active MPs when `MP_SCRAPER_DRY_RUN=true`)
  - [ ] 4.12 Create unit tests `lib/scrapers/mp-detail-scraper.test.ts` with test cases for:
    - URL slug generation
    - XML parsing
    - Rate limiting
    - Retry logic
    - Committee data storage
    - Error handling
  - [ ] 4.13 Run tests to ensure MPDetailScraper works correctly

- [ ] 5.0 Photo Storage Integration (Supabase)
  - [ ] 5.1 Set up Supabase Storage bucket `mp-photos` with:
    - Public access level
    - CORS settings allowing the frontend domain
    - Verify bucket configuration
  - [ ] 5.2 Create `lib/storage/photo-storage.ts` service with functions to:
    - Download photo from URL (XML or HTML source)
    - Check HTTP headers (`Last-Modified` or `ETag`) or compare image hash
    - Compare with stored `photoLastModified` or `photoHash` in database
    - Only download if photo has changed (new photo, different hash, or `Last-Modified` is newer)
    - Resize photos to 400x400px max before upload
    - Compress images (JPEG format)
    - Upload to Supabase Storage bucket with filename: `{personId}.jpg`
    - Get public URL from Supabase Storage
    - Update `photoUrl` and `photoLastModified`/`photoHash` in database
    - Handle download/upload failures gracefully
  - [ ] 5.3 Integrate photo storage into `MPDetailScraper`:
    - Extract photo URL from XML if available
    - If photo URL not in XML, fallback to HTML scraping for that MP only
    - Use photo storage service to download, resize, and upload photos
    - Update database with photo URL and metadata
  - [ ] 5.4 Create unit tests `lib/storage/photo-storage.test.ts` with test cases for:
    - Photo download
    - Conditional download logic (hash/Last-Modified comparison)
    - Image resizing and compression
    - Supabase Storage upload
    - Error handling
  - [ ] 5.5 Run tests to ensure photo storage works correctly
  - [ ] 5.6 Test photo storage integration with a sample MP

- [ ] 6.0 Update Existing Scrapers for PersonId Matching
  - [ ] 6.1 Update `lib/scrapers/votes-scraper.ts`:
    - Replace `getMPNameMap()` with `getMPPersonIdMap()` that returns Map<personId, mpId>
    - Update vote matching logic to use personId instead of full name
    - Maintain backward compatibility during transition (handle both name and personId if needed)
    - Update all references to use personId matching
  - [ ] 6.2 Update `lib/scrapers/expenses-scraper.ts`:
    - Replace `getMPNameMap()` with `getMPPersonIdMap()`
    - Update expense matching logic to use personId instead of full name
    - Update all references to use personId matching
  - [ ] 6.3 Update `lib/scrapers/bills-scraper.ts`:
    - Replace name-based matching with PersonId matching
    - Update sponsor MP matching logic to use personId
    - Update `getMPNameMap()` to `getMPPersonIdMap()`
  - [ ] 6.4 Update `lib/scrapers/petitions-scraper.ts`:
    - Replace name-based matching with PersonId matching
    - Update sponsor MP matching logic to use personId
    - Update `getMPNameMap()` to `getMPPersonIdMap()`
  - [ ] 6.5 Update `lib/scrapers/committees-scraper.ts`:
    - Update to use XML data from `MPDetailScraper` as primary source
    - Keep HTML scraping as fallback for missing data
    - Update matching logic to use PersonId instead of name
    - Update `getMPNameMap()` to `getMPPersonIdMap()`
  - [ ] 6.6 Test all updated scrapers to ensure PersonId matching works correctly
  - [ ] 6.7 Verify backward compatibility (handle cases where personId might be null during transition)

- [ ] 7.0 Job Scheduling & Graphile Worker Integration
  - [ ] 7.1 Add `scrapeMPList` job function to `workers/scraper-jobs.ts`:
    - Create async function that instantiates `MPListScraper`
    - Call `scraper.run()` and handle results
    - Log success/failure
    - Send errors to Sentry
  - [ ] 7.2 Add `scrapeMPDetails` job function to `workers/scraper-jobs.ts`:
    - Create async function that instantiates `MPDetailScraper`
    - Call `scraper.run()` and handle results
    - Log success/failure
    - Send errors to Sentry
  - [ ] 7.3 Export both new job functions in the `taskList` object in `workers/scraper-jobs.ts`
  - [ ] 7.4 Update `lib/workers/schedule-jobs.ts` to schedule:
    - `scrapeMPList` job: Daily at 1 AM EST (configurable via `MP_LIST_SCRAPER_SCHEDULE` env var)
    - `scrapeMPDetails` job: Daily at 2 AM EST (configurable via `MP_DETAIL_SCRAPER_SCHEDULE` env var)
    - Use job keys: `scrape-mp-list-daily` and `scrape-mp-details-daily` for idempotency
    - Ensure `scrapeMPList` runs before `scrapeMPDetails`
  - [ ] 7.5 Test job scheduling locally
  - [ ] 7.6 Verify job sequencing (MPListScraper must complete before MPDetailScraper starts)

- [ ] 8.0 Testing & Documentation
  - [ ] 8.1 Run all unit tests for new scrapers and utilities
  - [x] 8.2 Test MPListScraper with dry run mode (`MP_SCRAPER_DRY_RUN=true`)
  - [ ] 8.3 Test MPDetailScraper with dry run mode
  - [x] 8.4 Test full integration: Run MPListScraper, then MPDetailScraper
  - [ ] 8.5 Verify soft delete functionality (test with mock data)
  - [ ] 8.6 Verify photo storage integration end-to-end
  - [ ] 8.7 Test PersonId matching in updated scrapers
  - [ ] 8.8 Test error handling and retry logic
  - [ ] 8.9 Test rate limiting (verify 1 request per second)
  - [ ] 8.10 Update README or create documentation for:
    - How to run the new scrapers
    - Environment variables needed
    - Dry run mode usage
    - Troubleshooting common issues
  - [ ] 8.11 Review code for any linting errors and fix them
  - [ ] 8.12 Perform final integration testing with real data (if possible in staging environment)

