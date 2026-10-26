from custom_components.family_hub.custody import add_rotation, household_for_day


def test_weekly_rotation():
    data = {"members": [{"id": "member"}]}
    updated = add_rotation(data, member_ids=["member"], starts_on="2026-10-01",
                           households=["A", "B"], days_per_block=7)
    rotation = updated["rotations"][0]
    assert household_for_day(rotation, "2026-10-01") == "A"
    assert household_for_day(rotation, "2026-10-08") == "B"
    assert household_for_day(rotation, "2026-10-15") == "A"
