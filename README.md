# Graphic design portfolio

An editorial portfolio built with Astro. The homepage gets its project content from the Notion Works database when the site is built. The site remains statically generated; changing Notion content takes effect on the next build.

## Set up Notion access

1. Create a Notion internal integration with read access to pages and databases.
2. Share the Works database with that integration.
3. Create a `.env.local` file in the project root and add the integration secret:

   ```env
   NOTION_API_KEY=secret_your_integration_token
   ```

   Keep the real token private. `.env.local` is ignored by Git and the token is only read by the Node build script.

The integration reads database `3f5acef2-5da8-80fd-b929-d1ef367663f9` using Notion API version `2026-03-11`. The expected Works properties are:

| Notion property | Type | How the site uses it |
| --- | --- | --- |
| Name | Title | Project title |
| Published | Checkbox | Only checked projects are included |
| Featured | Checkbox | Checked projects go in the large featured row |
| Discipline | Multi-select | Values are joined with `·` |
| Work Type | Select | Project metadata |
| Year | Number | Project metadata |
| Client | Rich text | Project metadata |
| Description | Rich text | Project summary and image alt text |
| Cover | Files | First image is downloaded into the generated site |

`Status` does not affect publishing. Optional properties may be blank. A missing or incorrectly typed required property stops the sync with a clear error. Cover images are downloaded during sync because Notion-hosted file URLs can expire; the generated copies in `public/notion-covers/` are ignored by Git.

## Develop and build

Install dependencies once with `npm install`. Then:

```sh
npm run dev
npm run build
npm run preview
```

The `predev` and `prebuild` scripts fetch Published projects from Notion before Astro starts or builds the site. For a deployed build, set `NOTION_API_KEY` in the hosting provider’s environment variables. Never add the token to client-side code or commit it.

If the sync reports an authentication error, check that the token is current. If it reports that the database is unavailable, share Works with the integration. Schema errors identify the property name and type that need attention.
