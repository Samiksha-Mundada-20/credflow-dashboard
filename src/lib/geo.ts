/**
 * Heuristic client-side check to determine if the user is located in the European Union.
 * Matches any timezone starting with "Europe/" except major non-EU countries.
 * Includes a localStorage override for testing: localStorage.setItem('force_eu_check', 'true')
 */
export function isLikelyEU(): boolean {
  if (typeof window === 'undefined') return false;

  // Manual developer override for testing all UI surfaces
  try {
    if (localStorage.getItem('force_eu_check') === 'true') {
      return true;
    }
  } catch {}

  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    if (!tz) return false;

    if (tz.startsWith('Europe/')) {
      // Exclude major non-EU countries/territories in Europe
      const nonEUTimezones = [
        'Europe/London',     // United Kingdom
        'Europe/Belfast',    // United Kingdom
        'Europe/Zurich',     // Switzerland
        'Europe/Oslo',       // Norway
        'Europe/Moscow',     // Russia
        'Europe/Kaliningrad',// Russia
        'Europe/Kirov',      // Russia
        'Europe/Samara',     // Russia
        'Europe/Saratov',    // Russia
        'Europe/Volgograd',  // Russia
        'Europe/Minsk',      // Belarus
        'Europe/Kiev',       // Ukraine
        'Europe/Kyiv',       // Ukraine
        'Europe/Uzhgorod',   // Ukraine
        'Europe/Zaporozhye', // Ukraine
        'Europe/Chisinau',   // Moldova
        'Europe/Tirane',     // Albania
        'Europe/Sarajevo',   // Bosnia and Herzegovina
        'Europe/Belgrade',   // Serbia
        'Europe/Skopje',     // North Macedonia
        'Europe/Pristina',   // Kosovo
        'Europe/Podgorica',  // Montenegro
        'Europe/Istanbul',   // Turkey
        'Europe/Vaduz'       // Liechtenstein
      ];

      return !nonEUTimezones.includes(tz);
    }
  } catch (e) {
    console.error('Error determining timezone:', e);
  }

  return false;
}
