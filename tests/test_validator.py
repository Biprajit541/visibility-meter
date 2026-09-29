from app.schemas import BrandMention, ExtractionResult, Sentiment
from app.validator import validate_extraction

BRANDS = ["Minimalist", "CeraVe", "Cetaphil"]
RAW = ("For sensitive skin, CeraVe is a solid pick.\n"
       "Minimalist offers good serums at a low price. Cetaphil is also popular.")


def mention(brand, quote, s=Sentiment.positive):
    return BrandMention(brand=brand, sentiment=s, quote=quote)


def full():
    return ExtractionResult(mentions=[
        mention("CeraVe", "CeraVe is a solid pick."),
        mention("Minimalist", "Minimalist offers good serums at a low price."),
        mention("Cetaphil", "Cetaphil is also popular.", Sentiment.neutral),
    ])


def test_valid_extraction_and_code_computed_positions():
    v = validate_extraction(RAW, full(), BRANDS)
    assert v.valid, v.reasons
    assert {m.brand: m.position for m in v.mentions} == {"CeraVe": 1, "Minimalist": 2, "Cetaphil": 3}


def test_paraphrased_quote_is_rejected():
    e = full()
    e.mentions[0] = mention("CeraVe", "CeraVe is a great choice.")
    v = validate_extraction(RAW, e, BRANDS)
    assert not v.valid and any(r.startswith("QUOTE_NOT_IN_RESPONSE") for r in v.reasons)


def test_whitespace_differences_in_quote_are_tolerated():
    e = full()
    e.mentions[0] = mention("CeraVe", "CeraVe  is a solid\npick.")
    assert validate_extraction(RAW, e, BRANDS).valid


def test_quote_must_name_the_brand():
    e = full()
    e.mentions[1] = mention("Minimalist", "good serums at a low price.")
    v = validate_extraction(RAW, e, BRANDS)
    assert not v.valid and any(r.startswith("QUOTE_MISSING_BRAND") for r in v.reasons)


def test_unknown_brand_rejected():
    e = full()
    e.mentions.append(mention("Neutrogena", "Cetaphil is also popular."))
    v = validate_extraction(RAW, e, BRANDS)
    assert not v.valid and any(r.startswith("UNKNOWN_BRAND") for r in v.reasons)


def test_repeated_brand_keeps_first_mention_and_stays_valid():
    e = full()
    e.mentions.append(mention("CeraVe", "CeraVe is a solid pick."))
    v = validate_extraction(RAW, e, BRANDS)
    assert v.valid
    assert not any(r.startswith("DUPLICATE_BRAND") for r in v.reasons)
    assert [m.brand for m in v.mentions].count("CeraVe") == 1


def test_omitted_brand_is_caught_by_deterministic_recall_check():
    e = ExtractionResult(mentions=full().mentions[:2])  # witness "forgot" Cetaphil
    v = validate_extraction(RAW, e, BRANDS)
    assert not v.valid and any("MISSED_MENTION: 'Cetaphil'" in r for r in v.reasons)


def test_brand_not_in_response_and_no_mentions_is_valid_empty():
    v = validate_extraction("Try a gentle cleanser and moisturizer.", ExtractionResult(mentions=[]), BRANDS)
    assert v.valid and v.mentions == []


def test_brand_match_respects_word_boundaries():
    v = validate_extraction("Minimalistic design is popular.", ExtractionResult(mentions=[]), BRANDS)
    assert v.valid  # 'Minimalistic' is not the brand 'Minimalist'


def test_markdown_bold_and_dash_variants_do_not_cause_false_rejection():
    raw = "Gentle cleansers include **Cetaphil**, **CeraVe** and Simple (Kind\u2011to\u2011Skin)."
    e = ExtractionResult(mentions=[
        mention("Cetaphil", "Gentle cleansers include Cetaphil, CeraVe and Simple (Kind-to-Skin)."),
        mention("CeraVe", "Gentle cleansers include Cetaphil, CeraVe and Simple (Kind-to-Skin)."),
    ])
    v = validate_extraction(raw, e, ["Minimalist", "CeraVe", "Cetaphil"])
    assert v.valid, v.reasons
    assert {m.brand: m.position for m in v.mentions} == {"Cetaphil": 1, "CeraVe": 2}


def test_normalisation_does_not_accept_paraphrase_or_case_change():
    raw = "**CeraVe** is a solid pick."
    for bad in ("CeraVe is a great pick.", "cerave is a solid pick."):
        v = validate_extraction(raw, ExtractionResult(mentions=[mention("CeraVe", bad)]), ["CeraVe"])
        assert not v.valid and v.reasons[0].startswith("QUOTE_NOT_IN_RESPONSE")
