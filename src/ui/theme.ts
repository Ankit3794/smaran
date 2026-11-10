// Design tokens for the "Direction A" look (warm paper, serif headings, terracotta accent).
// Plain object imported directly by every screen and component; there is no theme provider.
export const colors = {
  background: '#F6F2EA',
  card: '#FFFDF8',
  ink: '#221F1A',
  muted: '#8A8174',
  line: '#E7E0D3',
  chip: '#EFE8DB',
  accent: '#C8553D',
  accentInk: '#FFFFFF',
};

// Names match the font keys loaded in src/app/_layout.tsx.
export const fonts = {
  heading: 'Fraunces_600SemiBold',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemiBold: 'Inter_600SemiBold',
};

export const radius = 14;

export const spacing = { small: 8, medium: 16, large: 24 };
