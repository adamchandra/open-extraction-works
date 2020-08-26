#!/bin/sh

verbose=0

while getopts "v" name; do
    case $name in
        v)    verbose=1;;
        [?])  showhelp $0;;
    esac
done

# Look for TODO/FIX etc.
regex='(TODO|FIX|\.only)'
flags='--type-not html'

# numtodo=$(rg $regex workspaces | wc --lines)
numtodo=$(rg $flags $regex . | wc --lines)
echo "There are ~ $numtodo TODOs/FIX/ etc.. in the codebase"

if [ "$verbose" = 1 ]; then
    rg $flags $regex .
fi
