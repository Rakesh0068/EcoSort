"""Recycling guidance for the 10 EcoSort waste classes.

Content is written to be factually defensible rather than decorative: each entry
states the disposal stream, required preparation, hazards, and the confusion the
model most often makes for that class.
"""

from __future__ import annotations

GUIDE: dict[str, dict] = {
    "battery": {
        "stream": "Hazardous / e-waste collection",
        "recyclable": True,
        "hazard": "high",
        "action": "Never place batteries in household recycling or trash. Take them to a designated battery or e-waste collection point.",
        "prep": [
            "Tape over terminals with non-conductive tape to prevent shorting",
            "Keep cells loose, not bundled together in a bag",
            "Store damaged or swollen cells in a non-flammable container",
            "Do not puncture, crush or expose to heat",
        ],
        "why": "Lithium-ion cells can enter thermal runaway when crushed in a collection truck or at a sorting facility, and these fires are a documented and growing problem in waste streams.",
        "confusion": ["metal", "trash"],
        "note": "Single-use alkaline cells are recyclable in most schemes; vehicle and industrial batteries go to specialist handlers.",
    },
    "biological": {
        "stream": "Organic / compost",
        "recyclable": True,
        "hazard": "low",
        "action": "Divert to composting or a municipal organic-waste bin. Keep out of the recycling stream entirely.",
        "prep": [
            "Remove all packaging, wrappers and stickers",
            "Drain excess liquid where practical",
            "Do not bag in conventional plastic unless your scheme accepts certified compostable liners",
            "Keep separate from recyclables to avoid contamination",
        ],
        "why": "Food and garden residue contaminates paper and plastic recyclables, and moisture degrades cardboard fibre. Separated organics can instead become compost or biogas.",
        "confusion": ["trash", "paper"],
        "note": "Cooked meat and dairy acceptance varies by scheme - check local rules for composting versus anaerobic digestion.",
    },
    "cardboard": {
        "stream": "Paper & card recycling",
        "recyclable": True,
        "hazard": "none",
        "action": "Flatten and place in the paper and cardboard recycling stream.",
        "prep": [
            "Flatten boxes to save space and help sorting",
            "Remove packing tape, polystyrene and bubble wrap",
            "Detach shipping labels where easy",
            "Keep dry - wet fibre cannot be reprocessed",
            "Scrape off heavy food residue",
        ],
        "why": "Cardboard is a high-value recyclable: corrugated fibre can be reprocessed several times into new board. Grease and moisture are the main reasons it gets rejected.",
        "confusion": ["paper", "trash"],
        "note": "Heavily grease-soaked pizza box bases are often better composted than recycled - tear off the clean lid for recycling.",
    },
    "clothes": {
        "stream": "Textile collection",
        "recyclable": True,
        "hazard": "none",
        "action": "Do not put textiles in curbside recycling. Wearable items go to reuse or charity; damaged items go to a textile collection bank.",
        "prep": [
            "Wash and dry items before donating",
            "Separate wearable clothing from rags",
            "Bag textiles so they stay clean and dry",
            "Remove belts, hangers and non-textile accessories",
        ],
        "why": "Clothing tangles and jams single-stream sorting machinery. Dedicated textile recovery allows reuse first, then fibre recycling into insulation or wiper cloth.",
        "confusion": ["shoes", "trash"],
        "note": "Reuse beats recycling: a garment worn for nine more months materially reduces its footprint relative to fibre recovery.",
    },
    "glass": {
        "stream": "Glass recycling",
        "recyclable": True,
        "hazard": "low",
        "action": "Rinse and place in the glass recycling stream, separated by colour if your scheme requires it.",
        "prep": [
            "Empty and rinse contents",
            "Remove lids, caps and corks - these belong to other streams",
            "Do not include drinking glasses, ceramics, Pyrex or window glass",
            "Handle broken glass carefully and wrap it",
        ],
        "why": "Container glass can be remelted endlessly without loss of quality. But borosilicate, ceramics and lead crystal melt at different temperatures and create defects that ruin a whole batch.",
        "confusion": ["metal", "plastic", "trash"],
        "note": "This is one of the hardest classes for vision models: clear containers of glass, PET and metal look very similar under varied lighting.",
    },
    "metal": {
        "stream": "Metal recycling",
        "recyclable": True,
        "hazard": "low",
        "action": "Rinse and place in the metal recycling stream. Steel and aluminium are both recovered magnetically or by eddy current at facilities.",
        "prep": [
            "Empty and rinse cans and tins",
            "Remove plastic lids and film where possible",
            "Flatten or nest cans if your scheme asks for it",
            "Empty aerosols completely - do not pierce or crush them",
            "Keep sharp edges folded inward",
        ],
        "why": "Aluminium recycling uses a small fraction of the energy required for primary smelting, making it one of the most energy-effective materials to recover.",
        "confusion": ["glass", "plastic", "battery"],
        "note": "Scrap containing electronics or cells should go to e-waste rather than general metal recovery.",
    },
    "paper": {
        "stream": "Paper recycling",
        "recyclable": True,
        "hazard": "none",
        "action": "Place clean, dry paper in the paper recycling stream.",
        "prep": [
            "Keep dry and free of food residue",
            "Remove staples only if your scheme requires it - most accept them",
            "Exclude thermal receipts, waxed and plastic-coated paper",
            "Exclude paper towels and tissues",
            "Keep sheets loose rather than heavily shredded",
        ],
        "why": "Paper fibre shortens each time it is recycled, so clean input matters. Thermal receipts are usually coated with BPA-class compounds and contaminate the pulp stream.",
        "confusion": ["cardboard", "trash"],
        "note": "Mixed paper grades are worth less than sorted office paper - some schemes ask you to keep grades apart.",
    },
    "plastic": {
        "stream": "Plastic recycling",
        "recyclable": True,
        "hazard": "low",
        "action": "Empty, rinse and place in the plastic recycling stream. Check the resin code and local acceptance list.",
        "prep": [
            "Empty and rinse contents",
            "Replace caps only if your scheme accepts caps-on",
            "Keep rigid containers separate from soft film",
            "Do not bag recyclables in a plastic carrier bag",
            "Remove paper labels where they detach easily",
        ],
        "why": "Plastics are sorted by resin type, and mixing polymers ruins reprocessing. Flexible film and black pigmented plastic are the two most common rejection causes at facilities.",
        "confusion": ["glass", "metal", "trash"],
        "note": "Black plastic was historically invisible to near-infrared sorters. Rigid and flexible plastics usually take different routes.",
    },
    "shoes": {
        "stream": "Textile / specialist shoe recycling",
        "recyclable": True,
        "hazard": "none",
        "action": "Not accepted in curbside recycling. Wearable pairs go to reuse; worn pairs go to a shoe or textile collection point.",
        "prep": [
            "Clean off mud and debris",
            "Keep pairs together",
            "Separate wearable shoes from damaged ones",
            "Do not include in general plastic or textile bags unless a scheme accepts them",
        ],
        "why": "Footwear bonds rubber, foam, textile and adhesive into a single composite that cannot be separated by standard sorting lines. Specialist programmes grind them into sports-surface material.",
        "confusion": ["clothes", "trash"],
        "note": "Reuse and donation are the preferred routes where the shoes are still wearable.",
    },
    "trash": {
        "stream": "Residual / landfill or energy recovery",
        "recyclable": False,
        "hazard": "unknown",
        "action": "Residual waste stream. Before disposal, check that no recyclable material is mixed in, and screen out anything hazardous.",
        "prep": [
            "Remove any batteries or electronics before disposal",
            "Check for recoverable metal, glass, paper or plastic",
            "Bag residual waste to contain litter and odour",
            "Do not place hot ash or medical sharps in household bags",
        ],
        "why": "'Trash' is the residual category - the material left after recyclables are removed. Contamination runs the other way too: recyclables thrown in here are lost from recovery.",
        "confusion": ["plastic", "paper", "clothes"],
        "note": "This class is inherently heterogeneous, which is why the model's confidence here is often lower and worth reviewing.",
    },
}

UNCERTAIN_TIPS = [
    "Use brighter, even lighting and avoid harsh shadows",
    "Move closer so the object fills most of the frame",
    "Remove background clutter and other waste items",
    "Place the item on a plain, contrasting surface",
    "Avoid motion blur - hold the camera steady",
    "If the item is a composite of materials, scan each part separately",
]


def guidance(cls: str) -> dict:
    entry = GUIDE.get(cls)
    if entry is None:
        return {
            "stream": "Unknown",
            "recyclable": False,
            "hazard": "unknown",
            "action": "No guidance available for this class.",
            "prep": [],
            "why": "",
            "confusion": [],
            "note": "",
        }
    return entry
