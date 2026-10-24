import re

from .schemas import Passage


def normalize_text(text: str) -> str:
    normalized = re.sub(r"[ \t]+", " ", text.replace("\r\n", "\n").replace("\r", "\n"))
    normalized = re.sub(r"\n{3,}", "\n\n", normalized)
    return normalized.strip()


def _normalized_with_offsets(text: str) -> tuple[str, list[int]]:
    chars: list[str] = []
    offsets: list[int] = []
    index = 0
    while index < len(text):
        if text[index] in " \t\r\n":
            start = index
            while index < len(text) and text[index] in " \t\r\n":
                index += 1
            newline_positions: list[int] = []
            position = start
            while position < index:
                if text[position] == "\r":
                    newline_positions.append(position)
                    position += 2 if position + 1 < index and text[position + 1] == "\n" else 1
                elif text[position] == "\n":
                    newline_positions.append(position)
                    position += 1
                else:
                    position += 1
            if newline_positions:
                normalized_break = "\n\n" if len(newline_positions) > 1 else "\n"
                if chars and index < len(text):
                    chars.extend(normalized_break)
                    offsets.extend(newline_positions[:len(normalized_break)])
            elif chars and index < len(text):
                chars.append(" ")
                offsets.append(start)
        else:
            chars.append(text[index])
            offsets.append(index)
            index += 1
    return "".join(chars), offsets


def segment_text(input_text: str, max_chars: int = 1400) -> list[Passage]:
    if max_chars < 1:
        raise ValueError("max_chars must be greater than zero")
    text, source_offsets = _normalized_with_offsets(input_text)
    passages: list[Passage] = []
    for paragraph in re.finditer(r"\S(?:.*?\S)?(?=\n\s*\n|$)", text, re.DOTALL):
        paragraph_text = paragraph.group(0)
        start = 0
        while start < len(paragraph_text):
            end = min(start + max_chars, len(paragraph_text))
            if end < len(paragraph_text):
                split = paragraph_text.rfind(" ", start + 1, end + 1)
                if split > start:
                    end = split
            if end <= start:
                end = min(start + max_chars, len(paragraph_text))
            passage_text = paragraph_text[start:end].strip()
            if passage_text:
                local_start = paragraph.start() + start
                local_end = local_start + len(passage_text) - 1
                original_start = source_offsets[local_start]
                original_end = source_offsets[local_end] + 1
                passages.append(Passage(id=f"P{len(passages) + 1:03}", text=passage_text, start=original_start, end=original_end))
            start = end
            while start < len(paragraph_text) and paragraph_text[start].isspace():
                start += 1
    return passages


def find_exact_excerpt(source: str, excerpt: str) -> bool:
    def fold(value: str) -> str:
        value = value.translate(str.maketrans({"“": '"', "”": '"', "‘": "'", "’": "'"}))
        return re.sub(r"\s+", " ", value).strip()

    return bool(excerpt.strip()) and fold(excerpt) in fold(source)
