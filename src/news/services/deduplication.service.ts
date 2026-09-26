import { Injectable, Logger } from '@nestjs/common';

@Injectable()
export class DeduplicationService {
  private readonly THRESHOLD = 0.85;

  private jaroWinkler(a: string, b: string): number {
    const s1 = a.toLowerCase();
    const s2 = b.toLowerCase();
    if (s1 === s2) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;
    const maxLen = Math.max(s1.length, s2.length);
    const matchDistance = Math.floor(maxLen / 2) - 1;
    const s1Matches = new Array(s1.length).fill(false);
    const s2Matches = new Array(s2.length).fill(false);
    let matches = 0;
    for (let i = 0; i < s1.length; i++) {
      const start = Math.max(0, i - matchDistance);
      const end = Math.min(i + matchDistance + 1, s2.length);
      for (let j = start; j < end; j++) {
        if (s2Matches[j]) continue;
        if (s1[i] !== s2[j]) continue;
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }
    if (matches === 0) return 0;
    let transpositions = 0;
    let k = 0;
    for (let i = 0; i < s1.length; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }
    transpositions /= 2;
    return (matches / s1.length + matches / s2.length + (matches - transpositions) / matches) / 3;
  }

  isSimilar(titleA: string, titleB: string): boolean {
    const similarity = this.jaroWinkler(titleA, titleB);
    return similarity >= this.THRESHOLD;
  }
}
