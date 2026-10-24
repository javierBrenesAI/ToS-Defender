import pytest

from apps.api.text import find_exact_excerpt, normalize_text, segment_text


def test_normalize_line_endings_and_spaces():
    assert normalize_text("first\r\n\r\nsecond") == "first\n\nsecond"


def test_segments_with_stable_ids_and_offsets():
    source = "First clause.\n\nSecond clause about fees."
    passages = segment_text(source)
    assert [passage.id for passage in passages] == ["P001", "P002"]
    assert passages[0].text == "First clause."
    assert source[passages[0].start:passages[0].end] == passages[0].text
    assert source[passages[1].start:passages[1].end] == passages[1].text


def test_offsets_map_to_original_text_after_normalization():
    source = "  First   clause.\r\n\r\n  Second clause.  "
    passages = segment_text(source)
    assert source[passages[0].start:passages[0].end] == "First   clause."
    assert source[passages[1].start:passages[1].end] == "Second clause."


def test_long_unbroken_paragraph_respects_chunk_limit():
    passages = segment_text("a" * 25, max_chars=8)
    assert [len(passage.text) for passage in passages] == [8, 8, 8, 1]


def test_invalid_chunk_limit_is_rejected():
    with pytest.raises(ValueError):
        segment_text("text", max_chars=0)


def test_exact_excerpt_normalizes_whitespace_and_quotes():
    assert find_exact_excerpt('The company may  change\nprices and “terms”.', 'The company may change prices and "terms".')
    assert not find_exact_excerpt("Policy says cancel anytime.", "Policy says cancel automatically.")
