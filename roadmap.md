we are now gonna make a new app QuenceGIT

The app should function similarly to GitHub Desktop, but focused on a clean developer workflow

Main requirements:

Repository Management
Allow users to:
Clone repositories
Open existing repositories
Initialize new repositories
Store recent repositories locally
Detect Git repositories automatically
Git Features
Implement Git functionality using the local Git CLI:
git status
git add
git restore --staged
git commit
git push
git pull
git fetch
git checkout
git branch
git log


Similar layout to GITHUB desktop, 


Layout:

Left sidebar:
Repository list
Branches
Remotes
History
Main panel:
Changed files
Diff viewer
Commit composer


Changed Files View
Display:
modified
added
deleted
renamed
untracked


Allow:

stage/unstage per file
stage all
discard changes
Commit System
Commit message input
Optional description field
Show current branch
Disable commit if no staged changes

Diff Viewer
Side-by-side diff
Syntax highlighting
JSON formatting support
SQL syntax support
Image diff placeholder


Authentication
Use GitHub OAuth Device Flow:
Login button
Open browser automatically
Store token securely
Fetch authenticated user info




Repository History
Display:
commits
author
timestamp
branch graph placeholder


Extra Features
Add placeholders/interfaces for:
Pull Requests
Issues
Workspace snapshots
Deployment hooks