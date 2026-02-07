# agent-core/type-stubs.py
"""
Type stubs for PRISM external functions.
Used by Monty's type checker to validate agent-generated code BEFORE execution.
"""

from typing import TypedDict, List, Dict, Any, Optional

class YTDState(TypedDict):
    revenue: float
    expenses: float
    vat_paid: float
    pit_paid: float

class Thresholds(TypedDict):
    vat_threshold: float
    pit_threshold: float
    withholding_threshold: float

# ============================================================
# TIER 1: OBSERVATIONAL
# ============================================================

def calculate_ytd(user_id: str) -> YTDState:
    ...

def get_thresholds(user_id: str) -> Thresholds:
    ...

def query_tax_law(question: str) -> str:
    ...

def get_active_facts(user_id: str, layer: str = None) -> List[Dict[str, Any]]:
    """
    Get current PARA facts (Projects, Areas, Resources, Archives).
    
    Args:
        user_id: Tenant ID
        layer: Optional filter ('project', 'area', 'resource', 'archive')
    """
    ...

# ============================================================
# TIER 2: ADVISORY
# ============================================================

def store_atomic_fact(
    user_id: str, 
    layer: str, 
    entity_name: str, 
    fact_content: Any, 
    confidence: Optional[float] = 1.0
) -> None:
    """
    Store a durable fact. Supersedes old facts with same entity_name + layer.
    """
    ...

def create_optimization_hint(
    user_id: str,
    hint_type: str,
    details: Dict[str, Any]
) -> None:
    ...

def auto_tag_transaction(
    user_id: str,
    transaction_id: str,
    suggested_category: str
) -> None:
    ...

# ============================================================
# TIER 3: ACTIVE (Pauses execution, requires approval)
# ============================================================

def reclassify_transaction(
    user_id: str,
    transaction_id: str,
    new_category: str,
    reason: str
) -> None:
    ...

def create_project_draft(
    user_id: str,
    project_name: str,
    estimated_revenue: float
) -> None:
    ...

# ============================================================
# TIER 4: CRITICAL (Requires secure handover + MFA)
# ============================================================

def file_vat_registration(
    user_id: str,
    business_details: Dict[str, Any]
) -> None:
    ...

def submit_tax_return(
    user_id: str,
    year: int,
    return_data: Dict[str, Any]
) -> None:
    ...
