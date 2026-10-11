// Listener connections and play counts do not establish sound or motivation.
// This conservative wording filter supplements identity and numeric checks;
// catalogue explanations remain available when a claim is withheld.
export function supportedConnectionWriting(value) {
  return typeof value === 'string' && !/\b(?:sound(?:s|ing)?|sonic|acoustic|moods?|renewed interest|active exploration|natural extension|perfect (?:fit|match)|significant (?:last\.fm )?audience)\b/i.test(value);
}
