from app.group_buy_settlement import build_settlements, split_shipping


def test_split_shipping_equal_among_buyers():
    shares = split_shipping(
        3.0,
        card_costs={1: 10.0, 2: 5.0, 3: 0.0},
        copies={1: 2, 2: 1, 3: 0},
        mode="equal",
    )
    assert shares[1] == 1.5
    assert shares[2] == 1.5
    assert shares[3] == 0.0


def test_split_shipping_by_cost():
    shares = split_shipping(
        3.0,
        card_costs={1: 20.0, 2: 10.0},
        copies={1: 1, 2: 1},
        mode="by_cost",
    )
    assert shares[1] == 2.0
    assert shares[2] == 1.0


def test_split_shipping_by_copies_rounds_to_total():
    shares = split_shipping(
        1.0,
        card_costs={1: 1.0, 2: 1.0, 3: 1.0},
        copies={1: 1, 2: 1, 3: 1},
        mode="by_copies",
    )
    assert round(sum(shares.values()), 2) == 1.0
    # 0.33/0.33/0.34 style
    assert all(v in (0.33, 0.34) for v in shares.values())


def test_build_settlements_totals():
    rows = build_settlements(
        member_card_costs={1: 12.5, 2: 7.5},
        member_copies={1: 5, 2: 3},
        shipping_cost=4.0,
        shipping_split="by_copies",
    )
    by_id = {r.user_id: r for r in rows}
    assert by_id[1].shipping_share == 2.5
    assert by_id[2].shipping_share == 1.5
    assert by_id[1].total_owed == 15.0
    assert by_id[2].total_owed == 9.0
