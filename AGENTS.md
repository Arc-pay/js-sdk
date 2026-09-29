## GitHub Actions runner policy

GitHub-hosted runners are prohibited. Every executable job in `.github/workflows/`, including jobs inside reusable workflows and matrix or input-selected jobs, must target an eligible self-hosted runner. Never use `ubuntu-*`, `macos-*`, or `windows-*` GitHub-hosted `runs-on` labels, `runner: hosted`, or a hosted fallback. If no compatible self-hosted runner exists, leave the job disabled and report the missing capacity; do not route it to a GitHub-hosted runner. Cancel any discovered queued or running GitHub-hosted workflow runs.
