# Maintenance & Update Workflow

This project is a TypeScript port of the Python [edge-tts](https://github.com/rany2/edge-tts) library. To keep this project up-to-date with the upstream Python version, follow this workflow.

## File Mapping

The TypeScript files in `src/` correspond almost 1:1 with the Python files in `src/edge_tts/`.

| Python File | TypeScript File |
|-------------|-----------------|
| `communicate.py` | `src/communicate.ts` |
| `constants.py` | `src/constants.ts` |
| `data_classes.py` | `src/dataClasses.ts` |
| `drm.py` | `src/drm.ts` |
| `exceptions.py` | `src/exceptions.ts` |
| `srt_composer.py` | `src/srtComposer.ts` |
| `submaker.py` | `src/subMaker.ts` |
| `typing.py` | `src/types.ts` |
| `voices.py` | `src/voices.ts` |
| `__init__.py` | `src/index.ts` |

## Update Process

1.  **Monitor Upstream**: Watch the [upstream repository](https://github.com/rany2/edge-tts) for new releases or commits.
2.  **Analyze Diffs**: When a new version is released, check the [comparison view](https://github.com/rany2/edge-tts/compare/vX.Y.Z...vA.B.C) or commit history to see which files were changed.
3.  **Port Changes**:
    *   Identify the modified Python files.
    *   Open the corresponding TypeScript file.
    *   Replicate the logic changes. Pay attention to:
        *   New constants or headers.
        *   Changes in the WebSocket protocol or payload.
        *   Modifications to the DRM/Token generation logic (Crucial for connectivity).
4.  **Verify**: Run `npm run build` and `node test_verification.js` to ensure the core functionality still works.
5.  **Release**: Bump the version in `package.json` and push to GitHub.
