try:
    with open("Nigeria-Tax-Act-2025.pdf", "rb") as f:
        header = f.read(10)
        print(f"File exists. Header: {header}")
except Exception as e:
    print(f"Error: {e}")
