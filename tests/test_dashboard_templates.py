"""Regression coverage for safe, editable Family Hub dashboard layouts."""

from custom_components.family_hub.dashboard_templates import (
    family_dashboard,
    member_dashboard,
    templates_for_members,
)


def test_family_template_contains_only_registered_custom_cards():
    from custom_components.family_hub.frontend import FILES

    config = family_dashboard()
    assert config["title"] == "Family Hub"
    assert [view["path"] for view in config["views"]] == [
        "home", "planning", "approvals", "manage"
    ]
    card_names = {
        card["type"].removeprefix("custom:")
        for view in config["views"]
        for card in view["cards"]
    }
    # A few JavaScript resources define multiple custom cards.
    assert "family-hub-overview-card" in card_names
    assert "family-hub-manage-card" in card_names
    assert "family-hub-approvals-card" in card_names
    assert "family-hub-shopping-card" in card_names
    assert "family-hub-routines-card" in card_names
    assert "family-hub-custody-card" in card_names
    assert "family-hub.js" in FILES


def test_member_templates_have_stable_unique_paths_and_explicit_scope():
    members = [
        {"id": "opaque-alpha", "name": "Member A"},
        {"id": "opaque-beta", "name": "Member B"},
    ]
    result = templates_for_members(members)
    assert result == templates_for_members(members)
    assert result["family"]["url_path"] == "family-hub"
    assert len(result["members"]) == 2

    paths = [entry["url_path"] for entry in result["members"]]
    assert len(paths) == len(set(paths))
    assert all(path.startswith("family-hub-member-") for path in paths)
    assert all("opaque-" not in path for path in paths)

    for item, member in zip(result["members"], members):
        views = item["config"]["views"]
        assert [view["path"] for view in views] == ["my-day", "my-room"]
        assert views[0]["cards"] == [
            {"type": "custom:family-hub-member-card", "member_id": member["id"]},
            {"type": "custom:family-hub-routines-card", "member_id": member["id"]},
            {"type": "custom:family-hub-custody-card", "member_id": member["id"]},
        ]
        assert views[1]["cards"] == [
            {"type": "custom:family-hub-room-card", "member_id": member["id"]}
        ]


def test_dashboard_templates_do_not_share_mutable_configuration():
    member = {"id": "opaque", "name": "Member"}
    original = member_dashboard(member)
    original["views"][0]["cards"][0]["member_id"] = "changed"
    assert member_dashboard(member)["views"][0]["cards"][0]["member_id"] == "opaque"
    assert templates_for_members([])["members"] == []
