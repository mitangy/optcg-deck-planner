from app.group_buy_merge import MemberNeed, merge_member_needs


def test_merge_sums_still_need_across_members():
    lines = merge_member_needs(
        [
            MemberNeed(1, "Ada", "OP01-001", 2, 100),
            MemberNeed(2, "Bob", "OP01-001", 3, 100),
            MemberNeed(1, "Ada", "OP01-002", 1, 200),
        ]
    )
    assert len(lines) == 2
    first = lines[0]
    assert first.card_id == "OP01-001"
    assert first.total_qty == 5
    assert [(m.display_name, m.qty) for m in first.members] == [("Ada", 2), ("Bob", 3)]
    assert first.suggested_product_id == 100


def test_merge_skips_zero_and_normalizes_card_id():
    lines = merge_member_needs(
        [
            MemberNeed(1, "Ada", "op01-001", 0, 1),
            MemberNeed(2, "Bob", "op01-001", 4, 9),
        ]
    )
    assert len(lines) == 1
    assert lines[0].card_id == "OP01-001"
    assert lines[0].total_qty == 4
    assert lines[0].suggested_product_id == 9


def test_merge_same_member_duplicate_lines_add():
    lines = merge_member_needs(
        [
            MemberNeed(1, "Ada", "OP09-015", 1, None),
            MemberNeed(1, "Ada", "OP09-015", 2, 55),
        ]
    )
    assert len(lines) == 1
    assert lines[0].total_qty == 3
    assert lines[0].members[0].qty == 3
    assert lines[0].suggested_product_id == 55
