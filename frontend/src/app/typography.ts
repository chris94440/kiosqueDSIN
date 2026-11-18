/** Espace insécable avant « ? : ; ! » » et après « « » : la ponctuation ne se retrouve jamais seule en début de ligne. */
export const typo = (text: string): string => text.replace(/ ([?:;!»])/g, '\u00a0$1').replace(/« /g, '«\u00a0');
