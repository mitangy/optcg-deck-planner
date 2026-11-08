from datetime import datetime, timedelta, timezone

from app.core.time import as_utc, as_utc_or_none, utcnow


def test_a_naive_database_time_is_labelled_utc_not_shifted_refactor_3_9a():
    naive = datetime(2026, 3, 1, 12, 0)
    out = as_utc(naive)
    assert out.tzinfo is timezone.utc and out.replace(tzinfo=None) == naive


def test_an_aware_time_in_another_zone_is_returned_untouched_refactor_3_9a():
    zone = timezone(timedelta(hours=9))
    aware = datetime(2026, 3, 1, 12, 0, tzinfo=zone)
    assert as_utc(aware) is aware


def test_the_optional_variant_lets_none_through_and_utcnow_is_aware_refactor_3_9a():
    assert as_utc_or_none(None) is None
    assert as_utc_or_none(datetime(2026, 1, 1)).tzinfo is timezone.utc
    assert utcnow().utcoffset() == timedelta(0)
