#!/usr/bin/env python3
import hashlib, os, shutil, sys
import numpy as np
import onnx
from onnx import TensorProto, helper, numpy_helper
from ultralytics import YOLO


def halve_weights(model: onnx.ModelProto, min_elems: int = 64) -> onnx.ModelProto:
    g = model.graph
    casts, keep = [], []
    for init in g.initializer:
        if init.data_type == TensorProto.FLOAT and int(np.prod(init.dims)) >= min_elems:
            arr = numpy_helper.to_array(init)
            half = numpy_helper.from_array(arr.astype(np.float16), init.name + "__fp16")
            keep.append(half)
            casts.append(helper.make_node("Cast", [half.name], [init.name], to=TensorProto.FLOAT, name=init.name + "__cast"))
        else:
            keep.append(init)
    del g.initializer[:]
    g.initializer.extend(keep)
    nodes = list(g.node)
    del g.node[:]
    g.node.extend(casts + nodes)
    return model


def main():
    weights, out = sys.argv[1], sys.argv[2]
    imgsz = int(sys.argv[3]) if len(sys.argv) > 3 else 640
    m = YOLO(weights)
    path = m.export(format="onnx", imgsz=imgsz, dynamic=True, simplify=True, opset=17, half=False)
    model = onnx.load(path)
    model = halve_weights(model)
    onnx.checker.check_model(model)
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)
    onnx.save(model, out)
    data = open(out, "rb").read()
    print(f"{out}: {len(data) / 1e6:.2f} MB, sha256 {hashlib.sha256(data).hexdigest()[:16]}")
    import onnxruntime as ort
    x = np.random.RandomState(0).rand(1, 3, 480, 288).astype(np.float32)
    a = ort.InferenceSession(path).run(None, {"images": x})[0]
    b = ort.InferenceSession(out).run(None, {"images": x})[0]
    print("output", b.shape, "max abs diff vs fp32 export: %.5f" % np.abs(a - b).max())


if __name__ == "__main__":
    main()
