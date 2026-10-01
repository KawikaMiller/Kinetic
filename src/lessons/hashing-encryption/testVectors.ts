// Reference SHA-256 digests recorded from node's own crypto.createHash (an implementation
// independent of the browser's Web Crypto), for the tests only.
export const SHA256: Record<string, string> = {
  '': 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
  '123456': '8d969eef6ecad3c29a3a629280e686cf0c3f5d5a86aff3ca12020c923adc6c92',
  'hello world': 'b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9',
  'hello World': 'db4067cec62c58bf8b2f8982071e77c082da9e00924bf3631f3b024fa54e7d7e',
  hunter2: 'f52fbd32b2b3b86ff88ef6c490628285f482af15ddcb29541f94bcf526a3f6c7',
  c81e7ahunter2: '0e7e8f941d655d2ffe9f1f3c4a9ba53d58df624cff9713e47d43acc42fb03b4d',
  '4f0d92hunter2': 'e3dde587934e8ec2bc9dc1bc6f7eafb5b50b943677a12e3c3606afd3e55f51f5',
  password: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
  qwerty: '65e84be33532fb784c48129675f9eff3a682b27168c0ea744b2cf58ee02337c5',
};

/** Look a digest up, failing loudly if a test asks for one that wasn't recorded. */
export function sha(s: string): string {
  const h = SHA256[s];
  if (!h) throw new Error(`no reference SHA-256 recorded for ${JSON.stringify(s)}`);
  return h;
}
