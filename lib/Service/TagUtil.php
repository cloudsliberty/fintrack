<?php

declare(strict_types=1);

namespace OCA\FinTrack\Service;

/**
 * Tags are case-insensitive throughout FinTrack — "Food", "food", and "FOOD"
 * are all the same tag. Every code path that creates or stores a tag (on a
 * transaction/recurring rule, in the saved tag list, via CSV import, via the
 * external API, or via category/tag import) must run new values through
 * normalize() before persisting, so duplicates never accumulate purely due
 * to casing differences.
 */
class TagUtil {

	/**
	 * Trims, lowercases, drops empties, and deduplicates a list of tags.
	 * Order of first occurrence is preserved.
	 *
	 * @param array $tags
	 * @return string[]
	 */
	public static function normalize(array $tags): array {
		$out = [];
		foreach ($tags as $t) {
			$t = mb_strtolower(trim((string)$t));
			if ($t === '' || in_array($t, $out, true)) {
				continue;
			}
			$out[] = $t;
		}
		return $out;
	}
}
