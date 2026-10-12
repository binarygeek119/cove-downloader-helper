import "@testing-library/jest-dom/vitest";
import { beforeEach } from "vitest";
import { installChromeMock } from "./chrome-mock";

installChromeMock();

beforeEach(() => {
  installChromeMock();
});
