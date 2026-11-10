// Renders text with the words of a search query marked, as in the Search results ("TLS [scanner]").
// Matching is case-insensitive and finds a word anywhere, so a prefix like "scan" marks the start of "scanner".
import { Text, type TextStyle } from 'react-native';
import { colors } from '@/ui/theme';

// Regex special characters in what the user typed must match literally.
function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function Highlight({ text, query, style, numberOfLines }: { text: string; query: string; style?: TextStyle; numberOfLines?: number }) {
  const words = query.split(/\s+/).filter((word) => /[\p{L}\p{N}]/u.test(word));
  if (words.length === 0) return <Text style={style} numberOfLines={numberOfLines}>{text}</Text>;

  // Splitting on a capturing group keeps the matches: every odd-numbered part is a match.
  const parts = text.split(new RegExp(`(${words.map(escapeRegExp).join('|')})`, 'giu'));
  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <Text key={index} testID="highlight" style={{ backgroundColor: colors.highlight }}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}
