import type {Note} from './model';

// A capture is one preview, not an invented title followed by the same text.
// This changes presentation only; the original and attachments stay untouched.
export function notePreview(note: Pick<Note, 'title' | 'original' | 'clarified'> & Partial<Pick<Note,'attachments'>>) {
  if (!note.title) {
    return {heading: note.original || (note.attachments?.some(a=>a.mime.startsWith('audio/'))?'Un recuerdo en audio':'Un recuerdo en imágenes'), excerpt: ''};
  }
  const body = note.clarified || note.original;
  return {
    heading: note.title,
    excerpt: body.trim() === note.title.trim() ? '' : body,
  };
}
