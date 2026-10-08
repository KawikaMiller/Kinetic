/** The fictional provider's resource types. Which attributes force a replacement is the lesson's whole point. */

export type Scalar = string | number | boolean;

export interface AttrSpec {
  kind: 'string' | 'number' | 'bool' | 'ref' | 'map';
  /** Changing it means the resource must be destroyed and created again. */
  forcesNew?: boolean;
  /** For a reference: the resource type it points at. */
  refType?: string;
}

export interface TypeSpec {
  /** Prefix of the ids the simulated cloud hands out. */
  idPrefix: string;
  attrs: Record<string, AttrSpec>;
}

export const SCHEMA: Record<string, TypeSpec> = {
  network: {
    idPrefix: 'net',
    attrs: {
      name: { kind: 'string', forcesNew: true },
      cidr: { kind: 'string', forcesNew: true },
    },
  },
  vm: {
    idPrefix: 'vm',
    attrs: {
      name: { kind: 'string', forcesNew: true },
      network: { kind: 'ref', refType: 'network', forcesNew: true },
      image: { kind: 'string', forcesNew: true },
      size: { kind: 'string' },
      tags: { kind: 'map' },
    },
  },
  bucket: {
    idPrefix: 'bkt',
    attrs: {
      name: { kind: 'string', forcesNew: true },
      versioning: { kind: 'bool' },
    },
  },
  dns_record: {
    idPrefix: 'dns',
    attrs: {
      name: { kind: 'string', forcesNew: true },
      target: { kind: 'ref', refType: 'vm' },
      ttl: { kind: 'number' },
    },
  },
};

export const TYPE_NAMES = Object.keys(SCHEMA);

/** The attribute a map attribute's entries are flattened under: `tags.env`. */
export const flatKey = (attr: string, entry: string) => `${attr}.${entry}`;

/** The schema attribute a flattened key belongs to, and whether it forces a replacement. */
export function specOfKey(type: string, key: string): AttrSpec | undefined {
  return SCHEMA[type]?.attrs[key.split('.')[0]];
}

export const forcesNew = (type: string, key: string) => specOfKey(type, key)?.forcesNew === true;

export const MAX_RESOURCES = 12;
export const MAX_TAGS = 4;
export const MAX_TEXT = 4000;
export const MAX_STRING = 40;
export const MAX_DIGITS = 9;
