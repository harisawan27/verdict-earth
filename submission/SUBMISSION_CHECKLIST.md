# Release and submission checklist

Target **Sunday, November 15, 2026, noon PKT**. This is the team’s conservative deadline.

## Local release

- [x] Confirm both Milestone 2 commits are in the current history.
- [x] Recompute eight POWER series and four windows for each site. Verify source checksums and reproduce Karachi’s baseline.
- [ ] If a genuine Giovanni export arrives, verify the original bytes, coverage, units, and grid point. Import, rebuild, and update the app, README, and submission sources. Leave the requirement explicitly unresolved while there are no incorporated Giovanni values.
- [x] Pass the clean npm install, scientific tests, offline data regeneration, and production build.
- [x] Verify both routes, mobile and desktop interactions, and the downloaded JSON against the release artifacts.
- [x] Document software license status. The repository has no project-wide license grant.

## Public deployment

- [ ] Review the local release commits, then push them to the existing GitHub repository when authorized. If you are pushing yourself, use `git push origin master` from the repository.
- [ ] Sign in at [Vercel New Project](https://vercel.com/new), import `harisawan27/verdict-earth`, choose the **Next.js** preset and repository root, and use `master` as the production branch. The default npm lockfile workflow needs no app environment variables or Python step. [Vercel GitHub deployment](https://vercel.com/docs/git/vercel-for-github).
- [ ] Deploy and use the production domain. Open it in a private browser window, test both routes and the export, and confirm the judge can visit without a Vercel sign-in. Add the actual verified domain to the README and team submission.

## NASA project page

- [ ] Record the 29-second demo with English captions. Upload it somewhere reviewers can open without requesting access. If the team chooses slides instead, stay within seven slides. [Submission guidance](https://github.com/nasa/spaceapps/discussions/1991).
- [ ] Open the Sahiwal Virtual team’s **Project** tab. Add the description, NASA credits, AI disclosure, final project link, and separate demo link. Verify all public links signed out and review the resource status wording. Submit after team review. [NASA Space Apps participant guides](https://www.spaceappschallenge.org/resources/).
