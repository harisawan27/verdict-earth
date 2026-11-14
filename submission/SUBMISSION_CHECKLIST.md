# Release and submission checklist

Target **Sunday, November 15, 2026, noon PKT**. This is the team’s conservative deadline.

## Local release

- [x] Confirm both Milestone 2 commits are in the current history.
- [x] Recompute the 31 atlas and eight Sindh POWER series, including all four windows. Verify source checksums and reproduce Karachi’s baseline.
- [x] Verify and archive the original Giovanni CSV and compare its 45 complete years with POWER. Include the verified Giovanni comparison and citation in the project submission.
- [x] Pass the clean npm install, scientific tests, offline data regeneration, and production build.
- [x] Verify the atlas, Sindh, and baseline routes, mobile and desktop interactions, and the downloaded JSON against the release artifacts.
- [x] Document software license status. The repository has no project-wide license grant.

## Public deployment

- [ ] Push the verified release to the existing GitHub repository with `git push origin master` from the repository.
- [ ] In the existing [Vercel dashboard](https://vercel.com/dashboard), verify that `harisawan27/verdict-earth` is linked and `master` is the production branch. The default npm lockfile workflow needs no app environment variables or Python step. [Vercel GitHub deployment](https://vercel.com/docs/git/vercel-for-github).
- [ ] Deploy and use the production domain. Open it in a private browser window, test the atlas, Sindh, and baseline routes and export, and confirm the judge can visit without a Vercel sign-in. Add the actual verified domain to the README and team submission.

## NASA project page

- [ ] Record the 29-second demo with English captions. Upload it somewhere reviewers can open without requesting access. If the team chooses slides instead, stay within seven slides. [Submission guidance](https://github.com/nasa/spaceapps/discussions/1991).
- [ ] Open the Sahiwal Virtual team’s **Project** tab. Add the description, NASA credits, AI disclosure, final project link, and separate demo link. Verify all public links signed out and review the resource status wording. Submit after team review. [NASA Space Apps participant guides](https://www.spaceappschallenge.org/resources/).
