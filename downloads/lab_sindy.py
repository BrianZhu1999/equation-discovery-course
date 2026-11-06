#!/usr/bin/env python3
"""Day 1: an independent teaching implementation of Lorenz + STLSQ.

This is not a reproduction of the paper authors' code. The estimator receives
only sampled training states and finite-difference derivatives. Known Lorenz
coefficients and held-out trajectories are used only after fitting for scoring.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import json
import platform
from datetime import datetime
from pathlib import Path

import numpy as np
import scipy
from scipy.integrate import solve_ivp


TERMS = ("1", "x", "y", "z", "x^2", "xy", "xz", "y^2", "yz", "z^2")
TRAIN_INITIAL = np.array([-8.0, 8.0, 27.0])
TEST_INITIAL = np.array([8.0, 7.0, 25.0])
PARAMETERS = {"sigma": 10.0, "rho": 28.0, "beta": 8.0 / 3.0}
RTOL, ATOL = 1e-10, 1e-12


def lorenz_rhs(time: float, state: np.ndarray) -> np.ndarray:
    """Ground-truth simulator; not called by fit_model or stlsq."""
    x, y, z = state
    return np.array([
        PARAMETERS["sigma"] * (y - x),
        x * (PARAMETERS["rho"] - z) - y,
        x * y - PARAMETERS["beta"] * z,
    ])


def time_grid(duration: float, dt: float) -> np.ndarray:
    steps = int(round(duration / dt))
    if steps < 4 or not np.isclose(steps * dt, duration, rtol=0, atol=1e-10):
        raise ValueError("时间长度必须为 dt 的整数倍，并至少包含 4 步。")
    return np.arange(steps + 1, dtype=float) * dt


def simulate_reference(times: np.ndarray, initial: np.ndarray) -> np.ndarray:
    solution = solve_ivp(lorenz_rhs, (times[0], times[-1]), initial, t_eval=times,
                         method="DOP853", rtol=RTOL, atol=ATOL, max_step=0.05)
    if not solution.success or solution.y.shape[1] != len(times):
        raise RuntimeError("参考 Lorenz 积分失败：" + solution.message)
    return solution.y.T


def library(states: np.ndarray, terms: tuple[str, ...] = TERMS) -> np.ndarray:
    """Map states (N,3) to candidate matrix (N,p), or a state (3,) to (p,)."""
    states = np.asarray(states)
    x, y, z = states[..., 0], states[..., 1], states[..., 2]
    values = {"1": np.ones_like(x), "x": x, "y": y, "z": z,
              "x^2": x*x, "xy": x*y, "xz": x*z, "y^2": y*y, "yz": y*z, "z^2": z*z}
    return np.stack([values[term] for term in terms], axis=-1)


def central_difference(states: np.ndarray, dt: float) -> tuple[np.ndarray, np.ndarray]:
    """Discard both endpoints; return aligned states and central differences."""
    return states[1:-1], (states[2:] - states[:-2]) / (2 * dt)


def stlsq(theta: np.ndarray, derivatives: np.ndarray, threshold: float,
          max_iterations: int = 20) -> tuple[np.ndarray, list[dict]]:
    """Hand-written sequential thresholded least squares, with no oracle terms.

    Coefficients are thresholded in the raw physical units of this toy example.
    Every derivative equation gets its own retained candidate set.
    """
    coefficients = np.linalg.lstsq(theta, derivatives, rcond=None)[0]
    previous_support = None
    trace = []
    for iteration in range(1, max_iterations + 1):
        support = np.abs(coefficients) >= threshold
        coefficients[~support] = 0.0
        for target in range(derivatives.shape[1]):
            retained = support[:, target]
            if retained.any():
                coefficients[retained, target] = np.linalg.lstsq(
                    theta[:, retained], derivatives[:, target], rcond=None
                )[0]
        residual = theta @ coefficients - derivatives
        trace.append({"iteration": iteration,
                      "retained_terms_per_equation": support.sum(axis=0).tolist(),
                      "derivative_relative_l2_residual": float(np.linalg.norm(residual) / np.linalg.norm(derivatives))})
        if previous_support is not None and np.array_equal(support, previous_support):
            break
        previous_support = support.copy()
    else:
        raise RuntimeError("STLSQ 在最大迭代次数内未稳定，未将其标为收敛。")
    return coefficients, trace


def fit_model(observed_training_states: np.ndarray, dt: float,
              terms: tuple[str, ...], threshold: float) -> dict:
    """Only training observations and the prespecified hyperparameters enter."""
    aligned_states, derivatives = central_difference(observed_training_states, dt)
    theta = library(aligned_states, terms)
    coefficients, trace = stlsq(theta, derivatives, threshold)
    return {"terms": terms, "coefficients": coefficients, "trace": trace,
            "training_matrix_shape": list(theta.shape),
            "derivative_matrix_shape": list(derivatives.shape),
            "coefficient_matrix_shape": list(coefficients.shape),
            "training_library_condition_number": float(np.linalg.cond(theta)),
            "training_derivative_relative_l2_error": float(np.linalg.norm(theta @ coefficients - derivatives) / np.linalg.norm(derivatives))}


def reference_coefficients() -> np.ndarray:
    """Evaluation-only oracle, called after every model has already been fit."""
    coefficients = np.zeros((len(TERMS), 3))
    coefficients[TERMS.index("x"), 0] = -PARAMETERS["sigma"]
    coefficients[TERMS.index("y"), 0] = PARAMETERS["sigma"]
    coefficients[TERMS.index("x"), 1] = PARAMETERS["rho"]
    coefficients[TERMS.index("y"), 1] = -1.0
    coefficients[TERMS.index("xz"), 1] = -1.0
    coefficients[TERMS.index("z"), 2] = -PARAMETERS["beta"]
    coefficients[TERMS.index("xy"), 2] = 1.0
    return coefficients


def rollout(model: dict, times: np.ndarray, initial: np.ndarray) -> tuple[np.ndarray, dict]:
    def learned_rhs(time: float, state: np.ndarray) -> np.ndarray:
        return library(state, model["terms"]) @ model["coefficients"]

    def divergence_guard(time: float, state: np.ndarray) -> float:
        return 1000.0 - np.max(np.abs(state))

    divergence_guard.terminal = True
    divergence_guard.direction = -1
    solution = solve_ivp(learned_rhs, (times[0], times[-1]), initial, t_eval=times,
                         events=divergence_guard, method="DOP853", rtol=RTOL, atol=ATOL,
                         max_step=0.05)
    prediction = np.full((len(times), 3), np.nan)
    count = solution.y.shape[1]
    prediction[:count] = solution.y.T
    metadata = {"solver_success": bool(solution.success),
                "reached_full_horizon": bool(count == len(times)),
                "last_saved_time": float(solution.t[-1]),
                "divergence_guard_hit": bool(len(solution.t_events[0])),
                "solver_message": solution.message}
    return prediction, metadata


def nrmse(prediction: np.ndarray, reference: np.ndarray, scale: np.ndarray) -> tuple[float, list[float]]:
    """RMSE in units of each reference coordinate's full-test standard deviation."""
    per_coordinate = np.sqrt(np.mean((prediction - reference)**2, axis=0)) / scale
    return float(np.sqrt(np.mean(per_coordinate**2))), per_coordinate.tolist()


def evaluate(model: dict, true_coefficients: np.ndarray, test_times: np.ndarray,
             test_states: np.ndarray) -> tuple[dict, np.ndarray]:
    expanded = np.zeros_like(true_coefficients)
    for index, term in enumerate(model["terms"]):
        expanded[TERMS.index(term)] = model["coefficients"][index]
    truth_support = true_coefficients != 0
    found_support = expanded != 0
    false_terms, missing_terms = [], []
    for i, term in enumerate(TERMS):
        for j, coordinate in enumerate(("dx/dt", "dy/dt", "dz/dt")):
            if found_support[i, j] and not truth_support[i, j]:
                false_terms.append(f"{coordinate}: {term}")
            if truth_support[i, j] and not found_support[i, j]:
                missing_terms.append(f"{coordinate}: {term}")
    active_error = float(np.linalg.norm((expanded - true_coefficients)[truth_support]) / np.linalg.norm(true_coefficients[truth_support]))
    maximum_active_error = float(np.max(np.abs((expanded - true_coefficients)[truth_support] / true_coefficients[truth_support])))
    prediction, integration = rollout(model, test_times, test_states[0])
    scale = np.std(test_states, axis=0)
    finite = np.isfinite(prediction).all(axis=1)
    prefix_score, prefix_by_coordinate = nrmse(prediction[finite], test_states[finite], scale)
    full_score = prefix_score if integration["reached_full_horizon"] else None
    early = test_times <= min(1.0, test_times[-1])
    early_score = nrmse(prediction[early], test_states[early], scale)[0] if finite[early].all() else None
    # Ground-truth derivatives are evaluation-only. They never enter fitting.
    true_test_derivatives = np.array([lorenz_rhs(t, state) for t, state in zip(test_times, test_states)])
    predicted_test_derivatives = library(test_states, model["terms"]) @ model["coefficients"]
    field_error = float(np.linalg.norm(predicted_test_derivatives - true_test_derivatives) / np.linalg.norm(true_test_derivatives))
    result = {k: v for k, v in model.items() if k not in {"coefficients", "terms"}}
    result.update({"terms": list(model["terms"]),
                   "equations": format_equations(model),
                   "structure_recovered_exactly": bool(np.array_equal(truth_support, found_support)),
                   "false_positive_terms": false_terms, "missing_true_terms": missing_terms,
                   "true_active_coefficient_relative_l2_error": active_error,
                   "maximum_true_active_coefficient_relative_error": maximum_active_error,
                   "all_coefficient_relative_l2_error": float(np.linalg.norm(expanded - true_coefficients) / np.linalg.norm(true_coefficients)),
                   "test_vector_field_relative_l2_error": field_error,
                   "test_full_trajectory_nrmse": full_score,
                   "test_full_trajectory_nrmse_per_coordinate": prefix_by_coordinate if integration["reached_full_horizon"] else None,
                   "test_finite_prefix_nrmse": prefix_score,
                   "test_first_second_nrmse": early_score,
                   "test_nrmse_scale": scale.tolist(),
                   "integration": integration})
    return result, prediction


def format_equations(model: dict) -> list[str]:
    equations = []
    for target, name in enumerate(("dx/dt", "dy/dt", "dz/dt")):
        pieces = [f"{model['coefficients'][i, target]:+.6g}*{term}"
                  for i, term in enumerate(model["terms"]) if model["coefficients"][i, target] != 0]
        equations.append(name + " = " + (" ".join(pieces).lstrip("+") or "0"))
    return equations


def write_csv(path: Path, fields: list[str], rows: list[dict]) -> None:
    with path.open("x", encoding="utf-8-sig", newline="") as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)


def run(args: argparse.Namespace) -> Path:
    if args.dt <= 0 or args.threshold <= 0 or args.noise_fraction < 0:
        raise ValueError("dt、threshold 必须为正，noise-fraction 不能为负。")
    train_times = time_grid(args.train_time, args.dt)
    test_times = time_grid(args.test_time, args.dt)
    training = simulate_reference(train_times, TRAIN_INITIAL)
    training_scale = training.std(axis=0)
    rng = np.random.default_rng(args.seed)
    noisy_training = training + rng.normal(size=training.shape) * (args.noise_fraction * training_scale)
    specs = [
        ("clean_full", training, TERMS),
        ("clean_without_xy", training, tuple(term for term in TERMS if term != "xy")),
        ("noisy_full", noisy_training, TERMS),
    ]
    # No test state, true derivative or coefficient matrix is available to fit.
    models = {name: fit_model(observations, args.dt, terms, args.threshold)
              for name, observations, terms in specs}
    test_states = simulate_reference(test_times, TEST_INITIAL)
    oracle = reference_coefficients()
    results, predictions = {}, {}
    for name, model in models.items():
        results[name], predictions[name] = evaluate(model, oracle, test_times, test_states)
    clean = results["clean_full"]
    gate = {"purpose": "Exact support recovery and coefficient-error checks for the clean-data teaching example",
            "criteria_fixed_before_run": {"exact_support": True, "maximum_active_coefficient_relative_l2_error": 0.02,
                                          "maximum_single_active_coefficient_relative_error": 0.05},
            "passed": clean["structure_recovered_exactly"] and clean["true_active_coefficient_relative_l2_error"] <= 0.02
                      and clean["maximum_true_active_coefficient_relative_error"] <= 0.05}
    output = args.out.resolve() if args.out else Path(__file__).resolve().parents[1] / "labs" / "runs" / datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    output.mkdir(parents=True, exist_ok=True)
    names = ("summary.json", "coefficients.csv", "training_samples.csv", "test_trajectories.csv")
    if any((output / name).exists() for name in names):
        raise FileExistsError(f"输出文件已存在，未覆盖；请使用新的 --out 目录：{output}")
    config = {"implementation": "independent educational implementation; not authors' code reproduction",
              "created_at": datetime.now().astimezone().isoformat(),
              "seed": args.seed, "dt": args.dt, "train_duration": args.train_time,
              "test_duration": args.test_time, "train_initial": TRAIN_INITIAL.tolist(),
              "test_initial": TEST_INITIAL.tolist(), "parameters": PARAMETERS,
              "threshold": args.threshold, "threshold_units": "unscaled physical coefficients",
              "noise_fraction_of_training_coordinate_std": args.noise_fraction,
              "training_coordinate_std": training_scale.tolist(),
              "derivatives": "second-order centered finite differences; first/last samples discarded",
              "solver": "DOP853", "rtol": RTOL, "atol": ATOL,
              "nrmse_definition": "sqrt(mean_j(mean_t(error_j^2) / var_t(full_clean_test_j)))",
              "test_protocol": "entire unseen-initial-condition trajectory; no test samples used in fit or threshold selection",
              "python": platform.python_version(), "numpy": np.__version__, "scipy": scipy.__version__,
              "source_sha256": hashlib.sha256(Path(__file__).read_bytes()).hexdigest()}
    clean_derivatives = central_difference(training, args.dt)[1]
    noisy_derivatives = central_difference(noisy_training, args.dt)[1]
    noise_diagnostics = {
        "observation_noise_std_per_coordinate": (noisy_training - training).std(axis=0).tolist(),
        "central_difference_noise_std_per_coordinate": (noisy_derivatives - clean_derivatives).std(axis=0).tolist(),
        "theoretical_central_difference_noise_std_per_coordinate": (args.noise_fraction * training_scale / (np.sqrt(2) * args.dt)).tolist(),
        "derivative_change_relative_l2": float(np.linalg.norm(noisy_derivatives - clean_derivatives) / np.linalg.norm(clean_derivatives)),
        "interpretation": "training-only diagnostic; not a score used to select threshold"
    }
    with (output / "summary.json").open("x", encoding="utf-8") as handle:
        json.dump({"config": config, "noise_diagnostics": noise_diagnostics,
                   "clean_recovery_gate": gate, "cases": results}, handle,
                  ensure_ascii=False, indent=2, allow_nan=False)
        handle.write("\n")
    coefficient_rows = []
    for name, model in models.items():
        for i, term in enumerate(TERMS):
            estimate = model["coefficients"][model["terms"].index(term)] if term in model["terms"] else np.zeros(3)
            coefficient_rows.append({"case": name, "term": term, "included_in_library": term in model["terms"],
                                     **{f"fit_{v}": float(estimate[j]) for j, v in enumerate(("dx", "dy", "dz"))},
                                     **{f"true_{v}": float(oracle[i, j]) for j, v in enumerate(("dx", "dy", "dz"))}})
    write_csv(output / "coefficients.csv", list(coefficient_rows[0]), coefficient_rows)
    train_rows = [{"t": float(t), **{v: float(training[i,j]) for j,v in enumerate(("x","y","z"))},
                   **{f"noisy_{v}": float(noisy_training[i,j]) for j,v in enumerate(("x","y","z"))}}
                  for i,t in enumerate(train_times)]
    write_csv(output / "training_samples.csv", list(train_rows[0]), train_rows)
    test_rows = []
    for i, time in enumerate(test_times):
        row = {"t": float(time), **{f"reference_{v}": float(test_states[i,j]) for j,v in enumerate(("x","y","z"))}}
        for name, prediction in predictions.items():
            row.update({f"{name}_{v}": float(prediction[i,j]) if np.isfinite(prediction[i,j]) else ""
                        for j,v in enumerate(("x","y","z"))})
        test_rows.append(row)
    write_csv(output / "test_trajectories.csv", list(test_rows[0]), test_rows)
    print("Independent teaching implementation; not a reproduction of authors' code.")
    for name, result in results.items():
        score = result["test_full_trajectory_nrmse"]
        formatted = f"{score:.6g}" if score is not None else "not_available (rollout stopped early)"
        print(f"{name}: exact_structure={result['structure_recovered_exactly']}; active_coefficient_rel_error={result['true_active_coefficient_relative_l2_error']:.6g}; full_test_nrmse={formatted}")
        for equation in result["equations"]:
            print("  " + equation)
    print(f"Clean recovery sanity gate: {'PASS' if gate['passed'] else 'FAIL'}")
    print(f"Saved: {output}")
    return output


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--out", type=Path, help="new output directory; existing files are never overwritten")
    parser.add_argument("--seed", type=int, default=20260917)
    parser.add_argument("--dt", type=float, default=0.005)
    parser.add_argument("--train-time", type=float, default=12.0)
    parser.add_argument("--test-time", type=float, default=6.0)
    parser.add_argument("--threshold", type=float, default=0.1)
    parser.add_argument("--noise-fraction", type=float, default=0.01)
    args = parser.parse_args()
    try:
        run(args)
        return 0
    except (OSError, ValueError, RuntimeError) as error:
        parser.exit(2, f"Error: {error}\n")


if __name__ == "__main__":
    raise SystemExit(main())
