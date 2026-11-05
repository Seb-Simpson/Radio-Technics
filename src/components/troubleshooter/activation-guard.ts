/**
 * RT-002D-R1: how long a NEW question's answer buttons ignore presses after
 * they appear. Stops the second tap of a fast double-tap — or a held key —
 * from landing on whatever button now sits in the same place. While unarmed,
 * buttons are `aria-disabled`, so assistive technology (and test tools) see
 * that they are not yet available. Unit tests set this to 0 (tests/setup.ts).
 */
export const ACTIVATION_GUARD = { ms: 300 };
