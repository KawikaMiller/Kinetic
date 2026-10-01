// The simulated machine: a few files and environment variables. access.log is the shared
// sample log (core/fixtures), the same one regex-basics matches against.
import { ACCESS_LOG } from '../../core/fixtures/accessLog';

/** File name → contents (lines joined with "\n", no trailing newline). */
export type Fs = Record<string, string>;
export type Env = Record<string, string>;

export const INITIAL_FS: Fs = {
  'access.log': ACCESS_LOG,
  'notes.txt': 'check the 500s on /api/orders\nrotate logs on Friday',
  'deploy.sh': '#!/bin/sh\nnpm ci && npm run build',
};

export const ENV: Env = { USER: 'ada', HOME: '/home/ada', LOG: 'access.log' };
