cmake_minimum_required(VERSION 3.22.1)
project("dkrwrapper")

set(CMAKE_C_STANDARD 11)
set(CMAKE_CXX_STANDARD 17)

# Enable strict warning flags and compatibility definitions
add_definitions(-DANDROID -D_GNU_SOURCE)

# Include directories for libultra, headers, and emulator stubs
include_directories(
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../include
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../src
    ${CMAKE_CURRENT_SOURCE_DIR}/../../../../libultra/include
)

# Collect all C/C++ runtime and core source files for APK packaging
file(GLOB_RECURSE DKR_CORE_SOURCES
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../../src/*.c"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../../libultra/src/*.c"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../../Android/app/src/main/cpp/*.c"
    "${CMAKE_CURRENT_SOURCE_DIR}/../../../../Android/app/src/main/cpp/*.cpp"
)

add_library(dkrwrapper SHARED
    ${DKR_CORE_SOURCES}
)

find_library(log-lib log)
find_library(android-lib android)
find_library(gles-lib GLESv2)
find_library(EGL-lib EGL)

target_link_libraries(dkrwrapper
    ${log-lib}
    ${android-lib}
    ${gles-lib}
    ${EGL-lib}
)
